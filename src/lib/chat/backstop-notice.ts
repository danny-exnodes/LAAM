// Text emitted when the tool-loop is FORCE-stopped (round backstop or a stuck repeat),
// split out of /api/chat as pure helpers so both pieces are unit-testable without
// driving a 25-round fetch mock through the route.
//
// Two distinct jobs:
//   synthNudge()          — the turn appended to the convo telling the model to answer NOW.
//   loopTruncatedNotice() — the honest "stopped early" footer shown to the user (Rule 12).

export type ChatMode = "voice" | "text" | undefined;

// Longest question echoed back into the nudge. A pasted wall of text as the "question"
// would otherwise re-inflate the prompt at exactly the moment the loop is out of room.
const MAX_QUESTION_CHARS = 300;

const truncateQuestion = (q: string): string => {
  const clean = q.replace(/\s+/g, " ").trim();
  return clean.length > MAX_QUESTION_CHARS ? clean.slice(0, MAX_QUESTION_CHARS) + "…" : clean;
};

// Appended as a final user turn when the loop was force-stopped, so a reasoning model
// writes an answer instead of "thinking about the next tool" and emitting no content.
//
// TWO things this must NOT do, both learned from a real 12-question thread (2026-08-05):
//
//  1. Claim the data is sufficient. The previous wording opened with "Đã đủ dữ liệu" —
//     false on a force-stop by definition, and it pushed the model to state a confident
//     answer built on whatever partial rows survived eviction.
//  2. Say "the question" without naming it. With tool results evicted under the char
//     budget, "trả lời câu hỏi" is ambiguous in a long thread — Q12 ("after-hours
//     overrides") came back answering Q9's topic (cash-drawer shortages) because the
//     nearest surviving context belonged to an earlier turn. Interpolating the literal
//     question pins the target.
export function synthNudge(lang: string, question: string): string {
  const q = truncateQuestion(question);
  const quoted = q ? `\n\nCÂU HỎI: «${q}»` : "";
  const quotedEn = q ? `\n\nQUESTION: «${q}»` : "";
  const quotedZh = q ? `\n\n问题：«${q}»` : "";

  const byLang: Record<"vi" | "en" | "zh", string> = {
    vi:
      "Vòng gọi công cụ đã dừng. Hãy TRẢ LỜI NGAY, chỉ dựa trên dữ liệu công cụ đã thu được ở trên." +
      quoted +
      "\n\nKHÔNG gọi thêm công cụ, KHÔNG suy luận dài. Nếu dữ liệu chưa đủ để trả lời trọn vẹn, hãy nói rõ phần nào còn thiếu — TUYỆT ĐỐI không suy đoán hay bịa số. Nếu công cụ trả về một CÂU HỎI LÀM RÕ, hãy chuyển câu hỏi đó cho người dùng bằng lời thường thay vì báo 'chưa có dữ liệu'.",
    en:
      "The tool loop has stopped. ANSWER NOW, using only the tool data gathered above." +
      quotedEn +
      "\n\nDo NOT call more tools, do NOT reason at length. If the data is not enough for a complete answer, say exactly what is missing — never guess or invent numbers.",
    zh:
      "工具调用已停止。请立即作答，只使用上面已获取的工具数据。" +
      quotedZh +
      "\n\n不要再调用工具，不要长篇推理。如果数据不足以完整回答，请明确说明缺少什么——绝不猜测或编造数字。",
  };
  return byLang[lang as keyof typeof byLang] ?? byLang.vi;
}

// Appended before the final completion on a turn that ran tools and finished NATURALLY.
//
// WHY a second, gentler variant instead of reusing synthNudge: measured 2026-08-05 on the
// Larvis Q12 turn — the loop hit NO backstop, so synthNudge never ran, and the answer still
// came back about a previous question's topic (cash-drawer shortages instead of after-hours
// overrides). The topic drift is not caused by the force-stop; it is caused by a long thread
// where earlier turns' subject matter is the most salient thing left in context. So the
// question has to be pinned on this path too — but WITHOUT synthNudge's "the loop stopped"
// framing, which would be false here and would leak an alarming caveat into a healthy turn.
//
// Returns "" when there is no question to pin, so the caller can skip appending a turn.
export function restateQuestion(lang: string, question: string): string {
  const q = truncateQuestion(question);
  if (!q) return "";

  const byLang: Record<"vi" | "en" | "zh", string> = {
    vi:
      `Dữ liệu công cụ ở trên đã đủ để viết câu trả lời. CHỈ trả lời đúng câu hỏi này: «${q}»` +
      "\n\nBỏ qua chủ đề của các lượt trước trong cuộc trò chuyện — chúng chỉ là bối cảnh. Nếu dữ liệu thu được không trả lời được đúng câu này, hãy nói thẳng là chưa có, đừng trả lời sang chuyện khác." +
      "\n\nNGOẠI LỆ: nếu công cụ trả về một CÂU HỎI LÀM RÕ thay vì dữ liệu, hãy CHUYỂN câu hỏi đó cho người dùng bằng lời thường dễ hiểu (giải thích ý nghĩa, đừng chỉ đọc tên bảng/cột) — KHÔNG được coi đó là 'chưa có dữ liệu'.",
    en:
      `The tool data above is what you have. Answer ONLY this question: «${q}»` +
      "\n\nIgnore the topics of earlier turns — they are context only. If the data does not answer THIS question, say so plainly rather than answering a different one." +
      "\n\nEXCEPTION: if a tool returned a CLARIFYING QUESTION instead of data, relay that question to the user in plain language (explain what it means; do not just recite table/column names) — do NOT report it as 'no data'.",
    zh:
      `以上工具数据即为全部依据。请仅回答这个问题：«${q}»` +
      "\n\n忽略此前轮次的主题——它们只是上下文。如果数据无法回答本问题，请直接说明，不要转而回答别的问题。" +
      "\n\n例外：如果工具返回的是澄清问题而非数据，请用通俗语言把该问题转达给用户（说明其含义，不要只念表名/列名）——不要将其报告为「没有数据」。",
  };
  return byLang[lang as keyof typeof byLang] ?? byLang.vi;
}

const LOOP_TRUNCATED: Record<"vi" | "en" | "zh", string> = {
  vi: "\n\n_(Đã dừng sau nhiều bước công cụ — kết quả có thể chưa đầy đủ.)_",
  en: "\n\n_(Stopped after many tool steps — the result may be incomplete.)_",
  zh: "\n\n_(在多次工具调用后停止——结果可能不完整。)_",
};

// Honest "stopped early" footer (Rule 12) — but NOT in voice mode. On /constellation the
// reply is spoken, and TTS reads this parenthetical aloud as if it were part of the
// answer: a meta-note about the agent's internals narrated to someone who asked about
// refunds. Same spoken-register carve-out as the currency formatting in lib/chat/voice.ts.
// Text mode keeps it — there it is a quiet visual caveat the reader can weigh.
export function loopTruncatedNotice(lang: string, mode: ChatMode): string {
  if (mode === "voice") return "";
  return LOOP_TRUNCATED[lang as keyof typeof LOOP_TRUNCATED] ?? LOOP_TRUNCATED.vi;
}
