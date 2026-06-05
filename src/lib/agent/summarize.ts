// SP-3 — bound lịch sử replay theo ngân sách CHAR (model 16GB). planHistory thuần;
// summarizeMessages dùng model (judgment, Rule 5) qua DI để test không cần Ollama.
export type HistoryMsg = { id: string; role: string; content: string };

export type HistoryPlan = {
  needsSummary: boolean;
  toSummarize: HistoryMsg[]; // lượt cũ cần gập vào summary
  toReplay: HistoryMsg[]; // lượt gần nhất giữ nguyên văn
};

const DEFAULT_BUDGET = 36000; // chars (~10k token) cho summary+replay — fallback; route truyền
// budget thực dẫn xuất từ num_ctx, ĐÃ chừa chỗ cho output + system + tool results (vá lỗi tràn
// context: prompt lấp đầy num_ctx ⇒ tokensIn+tokensOut==num_ctx ⇒ câu trả lời bị cắt giữa chừng).
const MIN_KEEP = 2; // SÀN: luôn giữ nguyên văn lượt user hiện tại + lượt liền trước.

export function planHistory(
  messages: HistoryMsg[],
  existingSummary: string | null,
  watermarkId: string | null,
  opts: { budgetChars?: number; keepLast?: number } = {},
): HistoryPlan {
  const budget = opts.budgetChars ?? DEFAULT_BUDGET;
  const minKeep = Math.max(1, opts.keepLast ?? MIN_KEEP);

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

  // Vượt budget → giữ các lượt MỚI NHẤT vừa khít (budget − summary), gập phần cũ vào summary.
  // BOUND theo KÍCH THƯỚC (không phải số lượng cố định): một lượt tool khổng lồ (vd liệt kê 10
  // agent) KHÔNG còn được replay nguyên văn chiếm trọn cửa sổ — đây chính là gốc lỗi cắt câu.
  const room = Math.max(0, budget - summaryLen);
  let acc = 0;
  let cut = live.length; // các lượt [cut..] replay nguyên văn
  for (let i = live.length - 1; i >= 0; i--) {
    acc += live[i].content?.length ?? 0;
    const kept = live.length - i;
    if (acc > room && kept > minKeep) {
      cut = i + 1;
      break;
    }
    cut = i;
  }
  if (cut <= 0) {
    // ngay cả sàn minKeep lượt gần nhất đã vượt budget → không gập thêm được; replay nguyên
    // (num_ctx lớn hấp thụ; caller log — Rule 12).
    return { needsSummary: false, toSummarize: [], toReplay: live };
  }
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
