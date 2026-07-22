// L1 — dựng system prompt động (thuần). `now` inject để test ổn định.
import type { ToolKind } from "./types";

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
  'tìm quanh một khu vực → {"nearby":{"query":"loại địa điểm","near":"khu vực"}} ' +
  '(bỏ "near" nếu người dùng nói "quanh đây/gần tôi" để dùng vị trí trình duyệt); ' +
  'một địa điểm → {"place":"tên địa điểm"}. ' +
  "Hệ thống tự tra toạ độ và vẽ tuyến — đừng tự bịa toạ độ hay số liệu; " +
  "chỉ chèn khối khi câu hỏi thực sự cần biểu đồ hoặc bản đồ.";

// Voice contract: on /constellation the reply is read aloud by TTS. Generate spoken
// prose, not written markup — no tables/lists/markdown, no read-aloud identifiers,
// summarize long lists. Replaces RENDER_GUIDE (chart/map are visual-only) in voice mode.
const VOICE_GUIDE =
  "Đây là hội thoại bằng giọng nói — câu trả lời của bạn sẽ được đọc thành tiếng. " +
  "Hãy trả lời như đang NÓI chuyện tự nhiên: câu ngắn, mạch lạc, KHÔNG dùng markdown " +
  "(không bảng, không gạch đầu dòng, không tiêu đề, không khối mã). " +
  "KHÔNG đọc ID, UUID, mã băm, mã dài hay đường dẫn — bỏ qua chúng, chỉ nêu khi người dùng hỏi thẳng. " +
  "Ưu tiên ngắn gọn và tóm tắt. Danh sách ngắn thì đọc tự nhiên kiểu \"gồm A, B và C\"; " +
  "nếu danh sách dài, nêu số lượng và vài mục tiêu biểu rồi hỏi người dùng muốn nghe hết hay tìm mục cụ thể. " +
  "Đọc số và ngày tháng theo cách người ta nói, đừng đọc dạng máy trừ khi cần chính xác.";

export function buildSystemPrompt(input: {
  lang: string;
  now: number;
  // QW-1: nhận tool kèm kind để render CÓ NHÓM (đọc/ghi). `string[]` cũ vẫn nhận để
  // tương thích caller chưa cập nhật — mặc định coi là tool ĐỌC.
  tools: { name: string; kind: ToolKind }[] | string[];
  base?: string;
  // Voice surface (/constellation): spoken-register output. Absent → "text" (unchanged).
  mode?: "voice" | "text";
}): string {
  const base = input.base ?? BASE;
  const date = new Date(input.now).toISOString().slice(0, 10);
  const langHint = LANG_HINT[input.lang] ?? "";
  // Chuẩn hoá về {name, kind}; string thuần → coi như "read" (tương thích ngược).
  const toolList = input.tools.map((t) =>
    typeof t === "string" ? { name: t, kind: "read" as ToolKind } : t,
  );
  // Render PHẲNG (baseline đã chứng minh). Đã thử QW-1 grouping (ĐỌC/GHI) + QW-5 few-shot
  // và đo k=6: reads giữ 6/6 nhưng write-selection KHÔNG cải thiện trên probe write-intent-trello
  // (noisy 20-100% — đo ra 3/3 → 2/6 → 0/6, không kết luận được) → BỎ restructuring chưa chứng
  // minh, giữ imperative GHI mạnh. `kind` vẫn nhận trong signature cho tương lai (eval/scale).
  const names = toolList.map((t) => t.name).join(", ");
  const tools = toolList.length
    ? `Bạn có thể gọi các công cụ sau khi cần dữ liệu thực: ${names}. ` +
      "Chỉ gọi công cụ khi câu hỏi cần dữ liệu thật; nếu không, trả lời trực tiếp. " +
      // F1: write-intent MUST go through a tool call (Rule 13 — code blocks unbacked claims).
      "Khi người dùng yêu cầu tạo/gửi/sửa/xoá/cập nhật, BẮT BUỘC gọi công cụ tương ứng. " +
      "TUYỆT ĐỐI KHÔNG nói đã tạo/gửi/xoá/cập nhật thành công nếu bạn chưa thực sự gọi công cụ và nhận được kết quả. " +
      // Trust structured tool output over prose (Rule 13): when a result carries structured data
      // (JSON, arrays), count/classify from that data — never from a prose summary — and never invent a total.
      "Khi kết quả trả về có dữ liệu cấu trúc (JSON, mảng), hãy đếm và phân loại từ chính dữ liệu cấu trúc đó, không suy từ đoạn văn tóm tắt, và không tự bịa con số tổng."
    : "";
  const guide = input.mode === "voice" ? VOICE_GUIDE : RENDER_GUIDE;
  return [base, `Hôm nay là ${date}.`, langHint, tools, guide].filter(Boolean).join(" ");
}
