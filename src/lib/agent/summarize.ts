// SP-3 — bound lịch sử replay theo ngân sách CHAR (model 16GB). planHistory thuần;
// summarizeMessages dùng model (judgment, Rule 5) qua DI để test không cần Ollama.
export type HistoryMsg = { id: string; role: string; content: string };

export type HistoryPlan = {
  needsSummary: boolean;
  toSummarize: HistoryMsg[]; // lượt cũ cần gập vào summary
  toReplay: HistoryMsg[]; // lượt gần nhất giữ nguyên văn
};

const DEFAULT_BUDGET = 16000; // ~4k token
const DEFAULT_KEEP = 6; // 3 cặp hỏi-đáp
const MIN_KEEP = 2; // luôn giữ ≥ lượt user hiện tại + 1

export function planHistory(
  messages: HistoryMsg[],
  existingSummary: string | null,
  watermarkId: string | null,
  opts: { budgetChars?: number; keepLast?: number } = {},
): HistoryPlan {
  const budget = opts.budgetChars ?? DEFAULT_BUDGET;
  const keepLast = opts.keepLast ?? DEFAULT_KEEP;

  // chỉ xét message SAU watermark (phần đã summarize không replay).
  let live = messages;
  if (watermarkId) {
    const idx = messages.findIndex((m) => m.id === watermarkId);
    live = idx >= 0 ? messages.slice(idx + 1) : messages;
  }

  const summaryLen = existingSummary ? existingSummary.length : 0;
  const liveLen = live.reduce((n, m) => n + (m.content?.length ?? 0), 0);
  if (summaryLen + liveLen <= budget) {
    return { needsSummary: false, toSummarize: [], toReplay: live };
  }

  const keep = Math.max(MIN_KEEP, keepLast);
  if (live.length <= keep) {
    // không gập thêm được mà vẫn giữ lượt hiện tại → replay nguyên (model tự cắt). Rule 12: caller log.
    return { needsSummary: false, toSummarize: [], toReplay: live };
  }
  const cut = live.length - keep;
  return {
    needsSummary: true,
    toSummarize: live.slice(0, cut),
    toReplay: live.slice(cut),
  };
}

export type SummarizeDeps = { callModel: (prompt: string) => Promise<string> };

const SUMMARY_INSTRUCTION: Record<string, string> = {
  vi: "Gộp phần TÓM TẮT TRƯỚC (nếu có) và đoạn hội thoại cũ dưới đây thành một bản tóm tắt ngắn gọn, giữ lại sự kiện, quyết định và tên/ID/số liệu CHÍNH XÁC cần để tiếp tục. Chỉ xuất nội dung tóm tắt, không lời dẫn.",
  en: "Merge the PREVIOUS SUMMARY (if any) and the old conversation below into one concise summary, preserving facts, decisions and exact names/IDs/numbers needed to continue. Output only the summary.",
  zh: "将下面的“先前摘要”（如有）与旧对话合并为一段简洁摘要，保留继续所需的事实、决定和准确的名称/ID/数字。只输出摘要内容。",
};

export async function summarizeMessages(
  toSummarize: HistoryMsg[],
  prevSummary: string | null,
  lang: string,
  deps: SummarizeDeps,
): Promise<string> {
  const instruction = SUMMARY_INSTRUCTION[lang] ?? SUMMARY_INSTRUCTION.vi;
  const prev = prevSummary ? `TÓM TẮT TRƯỚC:\n${prevSummary}\n\n` : "";
  const body = toSummarize.map((m) => `${m.role}: ${m.content}`).join("\n");
  const out = await deps.callModel(`${instruction}\n\n${prev}HỘI THOẠI CŨ:\n${body}`);
  return (out ?? "").trim();
}
