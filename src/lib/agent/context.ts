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

export function buildSystemPrompt(input: {
  lang: string;
  now: number;
  // QW-1: nhận tool kèm kind để render CÓ NHÓM (đọc/ghi). `string[]` cũ vẫn nhận để
  // tương thích caller chưa cập nhật — mặc định coi là tool ĐỌC.
  tools: { name: string; kind: ToolKind }[] | string[];
  base?: string;
}): string {
  const base = input.base ?? BASE;
  const date = new Date(input.now).toISOString().slice(0, 10);
  const langHint = LANG_HINT[input.lang] ?? "";
  // Chuẩn hoá về {name, kind}; string thuần → coi như "read" (tương thích ngược).
  const toolList = input.tools.map((t) =>
    typeof t === "string" ? { name: t, kind: "read" as ToolKind } : t,
  );
  // QW-1: render CÓ NHÓM — tách họ ĐỌC khỏi họ GHI để chống position-bias + làm rõ
  // tool nào an toàn gọi tự do, tool nào phải đợi người dùng yêu cầu (write).
  const readNames = toolList.filter((t) => t.kind === "read").map((t) => t.name);
  const writeNames = toolList.filter((t) => t.kind === "write").map((t) => t.name);
  const groups = [
    readNames.length
      ? `Công cụ ĐỌC (gọi tự do khi cần dữ liệu thật): ${readNames.join(", ")}.`
      : "",
    writeNames.length
      ? "Công cụ GHI (chỉ gọi khi người dùng yêu cầu tạo/gửi/sửa/xoá, kết quả sẽ cần xác nhận): " +
        `${writeNames.join(", ")}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  const tools = toolList.length
    ? `${groups} ` +
      "Chỉ gọi công cụ khi câu hỏi cần dữ liệu thật; nếu không, trả lời trực tiếp. " +
      // F1: write-intent MUST go through a tool call; the model must never narrate a
      // write as done without a real tool result (Rule 13 — code blocks unbacked claims).
      "Khi người dùng yêu cầu tạo/gửi/sửa/xoá/cập nhật, BẮT BUỘC gọi công cụ tương ứng. " +
      "TUYỆT ĐỐI KHÔNG nói đã tạo/gửi/xoá/cập nhật thành công nếu bạn chưa thực sự gọi công cụ và nhận được kết quả. " +
      // QW-5: few-shot ngắn minh hoạ luồng ghi — dùng tool demo (KHÔNG dùng connector
      // thật) để mẫu không bao giờ kích hoạt ghi tài khoản thật.
      'Ví dụ: người dùng nói "tạo task X" → gọi demo_create_task rồi báo lại kết quả thật.'
    : "";
  return [base, `Hôm nay là ${date}.`, langHint, tools, RENDER_GUIDE].filter(Boolean).join(" ");
}
