// L1 — dựng system prompt động (thuần). `now` inject để test ổn định.
const BASE =
  "Bạn là LAAM, trợ lý nội bộ thân thiện. Trả lời ngắn gọn, chính xác, hữu ích. " +
  "Dùng tiếng Việt khi người dùng dùng tiếng Việt.";

const LANG_HINT: Record<string, string> = {
  vi: "Trả lời bằng tiếng Việt.",
  en: "Reply in English.",
  zh: "用中文回答。",
};

export function buildSystemPrompt(input: {
  lang: string;
  now: number;
  toolNames: string[];
  base?: string;
}): string {
  const base = input.base ?? BASE;
  const date = new Date(input.now).toISOString().slice(0, 10);
  const langHint = LANG_HINT[input.lang] ?? "";
  const tools = input.toolNames.length
    ? `Bạn có thể gọi các công cụ sau khi cần dữ liệu thực: ${input.toolNames.join(", ")}. ` +
      "Chỉ gọi công cụ khi câu hỏi cần dữ liệu thật; nếu không, trả lời trực tiếp."
    : "";
  return [base, `Hôm nay là ${date}.`, langHint, tools].filter(Boolean).join(" ");
}
