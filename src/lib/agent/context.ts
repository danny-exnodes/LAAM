// L1 — dựng system prompt động (thuần). `now` inject để test ổn định.
const BASE =
  "Bạn là LAAM, trợ lý nội bộ thân thiện. Trả lời ngắn gọn, chính xác, hữu ích.";

const LANG_HINT: Record<string, string> = {
  vi: "Trả lời bằng tiếng Việt.",
  en: "Reply in English.",
  zh: "用中文回答。",
};

// Rich-render contract (F2): the chat UI turns ```chart / ```map fenced blocks
// into interactive recharts / Leaflet renders. Maps use PLACE NAMES only — the
// client resolves coordinates + the route line via /api/geocode|route|nearby, so
// the model never has to (and must not) reproduce a long coordinate polyline
// (Rule 13). Phrased without the word "công cụ" so the no-tools system prompt
// stays free of tool wording (see context.test.ts).
const RENDER_GUIDE =
  "Để trực quan hoá số liệu, chèn một khối ```chart chứa JSON kiểu Chart.js: " +
  '{"type":"bar|line|pie","title":"…","data":{"labels":[…],"datasets":[{"label":"…","data":[…]}]}}. ' +
  "Để chỉ đường hoặc hiển thị địa điểm, chèn một khối ```map chứa JSON dùng TÊN địa điểm: " +
  'chỉ đường → {"directions":{"from":"điểm đầu","to":"điểm cuối"}}; ' +
  'tìm quanh một nơi → {"nearby":{"query":"loại địa điểm","near":"khu vực"}}; ' +
  'một địa điểm → {"place":"tên địa điểm"}. ' +
  "Hệ thống tự tra toạ độ và vẽ tuyến — đừng tự bịa toạ độ hay số liệu; " +
  "chỉ chèn khối khi câu hỏi thực sự cần biểu đồ hoặc bản đồ.";

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
  return [base, `Hôm nay là ${date}.`, langHint, tools, RENDER_GUIDE].filter(Boolean).join(" ");
}
