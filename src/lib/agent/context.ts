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

// Voice contract: on /constellation the reply is read aloud by TTS. Prose is SPOKEN;
// an optional table/```chart block is NOT — extractForSpeech (lib/chat/voice.ts) cuts it
// out of the speech and the client shows it on a floating panel.
//
// Trước đây khối này CẤM HẲN markdown và panel do CODE tự suy từ mọi tool result
// (deriveFromToolResult + onView). Cách đó hiện panel cho cả những bước tra cứu nội bộ
// không liên quan gì tới câu trả lời (tra id theo tên, kết quả "not found"...), vì luật
// cấu trúc không trả lời được câu hỏi ngữ nghĩa "kết quả này có đáng cho user nhìn
// không". Nay giao quyết định đó cho model — CÙNG hợp đồng với RENDER_GUIDE của chat
// thường, để hai bề mặt hành xử như nhau và chỉ có một chỗ phải sửa.
const VOICE_GUIDE =
  "Đây là hội thoại bằng giọng nói — phần văn xuôi của bạn sẽ được ĐỌC THÀNH TIẾNG. " +
  "Hãy viết văn xuôi như đang NÓI chuyện tự nhiên: câu ngắn, mạch lạc, không tiêu đề, không gạch đầu dòng. " +
  // Kênh NHÌN, tách hẳn khỏi kênh NÓI. Tối đa MỘT khối/lượt: panel chỉ hiện được một
  // descriptor, và giới hạn ngay ở prompt thì không phải đi chọn hộ model sau đó.
  // Trigger phải MỆNH LỆNH và CÓ NGƯỠNG CỤ THỂ. Bản đầu viết "bạn được chèn" + "chỉ chèn
  // khi thật sự đáng nhìn" — model hiểu là tuỳ chọn nên gần như không bao giờ chèn, phải
  // hỏi thẳng "cho xem biểu đồ" nó mới làm.
  "Khi câu trả lời chứa dữ liệu NHIỀU MỤC — xếp hạng/top N, so sánh nhiều đối tượng, " +
  "số liệu theo thời gian, hay từ ba dòng dữ liệu trở lên — HÃY chèn khối hiển thị: " +
  "một bảng markdown (để thấy con số chính xác) và/hoặc một khối ```chart " +
  'chứa JSON kiểu Chart.js: {"type":"bar|line|pie","title":"…","data":{"labels":[…],"datasets":[{"label":"…","data":[…]}]}} ' +
  "(để thấy chênh lệch/xu hướng). Với dữ liệu xếp hạng, CẢ BẢNG LẪN BIỂU ĐỒ đều hữu ích — " +
  "cứ chèn cả hai, panel hiện được nhiều khối. " +
  "Người dùng KHÔNG cần phải yêu cầu \"cho xem bảng/biểu đồ\" thì bạn mới chèn — dữ liệu nhiều mục thì tự chèn. " +
  "Khối đó KHÔNG được đọc lên — nó được tách ra và hiện trên một bảng nổi giữa màn hình. " +
  // Người dùng đang NGHE: nếu phần đọc chỉ nói "xem bảng ở trên" thì với họ câu hỏi chưa
  // được trả lời. Câu trỏ panel đã do CODE chèn sẵn ở cuối (constellation.viewPointer),
  // model không cần và không nên tự viết câu đó.
  "Vì vậy phần văn xuôi phải TỰ NÓ trả lời xong câu hỏi, KHÔNG được đẩy người dùng sang khối " +
  "(đừng viết \"xem bảng ở trên/bên dưới\", \"chi tiết trong bảng\" — hệ thống tự thêm câu đó). " +
  "Với câu hỏi xếp hạng/top N, hãy ĐỌC LẦN LƯỢT từng mục kèm con số của nó — " +
  "\"đứng đầu là A với …, thứ hai là B với …\" — chứ không chỉ nêu tên hay nói \"có 5 mục\". " +
  "Ngược lại, câu trò chuyện, câu xác nhận, hay một hai con số thì KHÔNG cần khối nào. " +
  "Số liệu trong khối phải đúng với dữ liệu thật bạn đọc được — đừng bịa, đừng làm tròn cho gọn. " +
  // G1: cả hai câu dưới đây phải neo rõ vào LỜI NÓI RA. Bản cũ ("KHÔNG đọc ID…",
  // "Ưu tiên ngắn gọn") bị model hiểu là chỉ dẫn về mức độ TRA CỨU: nó dừng sau 1 tool
  // liệt kê và né luôn các tool nhận UUID → trả lời nông/bịa (đo: 3/17 lượt voice hỏng,
  // 0/6 lượt text). Không nhắc "công cụ" ở đây — VOICE_GUIDE còn dùng cho đường KHÔNG
  // tool (Claude MVS ở route) và phải sạch từ ngữ tool như RENDER_GUIDE.
  "KHÔNG ĐỌC TO ID, UUID, mã băm, mã dài hay đường dẫn — bỏ chúng khỏi lời nói, chỉ nêu khi người dùng hỏi thẳng. " +
  "Ưu tiên ngắn gọn và tóm tắt — đây là yêu cầu về CÁCH TRÌNH BÀY câu trả lời, không phải về mức độ tìm hiểu dữ liệu. " +
  // "Ngắn gọn" ở trên nói về CÁCH DIỄN ĐẠT, không phải cớ để bỏ bớt nội dung: một câu
  // "top 5 …" vẫn phải đọc đủ 5 mục kèm số, chỉ là đọc bằng câu nói tự nhiên chứ không
  // đọc cấu trúc bảng. Bản trước ghi "vẫn đọc gọn bằng lời" nên model rút còn một câu
  // rồi đẩy user sang bảng.
  "Danh sách ngắn KHÔNG kèm số liệu thì đọc tự nhiên kiểu \"gồm A, B và C\"; " +
  "danh sách CÓ số liệu (xếp hạng, so sánh) thì đọc đủ từng mục kèm số, bằng câu nói tự nhiên, " +
  "và vẫn phải kèm khối hiển thị ở trên; " +
  "chỉ khi danh sách QUÁ DÀI (trên khoảng mười mục) mới nêu số lượng và vài mục tiêu biểu rồi hỏi người dùng muốn nghe tiếp phần nào. " +
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
      // F3: explicit re-search MUST go through a fresh tool call, even when the answer already
      // sits in the conversation (verbatim or folded into summarizeMessages' summary) — a prior
      // tool result can be stale, and the user's "lại" (again) is an explicit freshness request.
      // Anchored to the refresh VERB PHRASE ("tìm/tra/kiểm tra lại", "cập nhật lại kết quả"), not
      // the bare particle "lại" — that particle is common in unrelated Vietnamese phrasing
      // ("quay lại", "và lại") and would over-trigger tool calls if matched alone.
      "Khi người dùng yêu cầu tìm/tra cứu/kiểm tra LẠI, hoặc yêu cầu cập nhật/làm mới lại kết quả, " +
      "BẮT BUỘC gọi lại công cụ tương ứng để lấy dữ liệu mới nhất — KHÔNG dùng lại kết quả cũ trong hội thoại " +
      "hay bản tóm tắt trước đó, kể cả khi bạn nghĩ mình đã biết câu trả lời. " +
      // Trust structured tool output over prose (Rule 13): when a result carries structured data
      // (JSON, arrays), count/classify from that data — never from a prose summary — and never invent a total.
      "Khi kết quả trả về có dữ liệu cấu trúc (JSON, mảng), hãy đếm và phân loại từ chính dữ liệu cấu trúc đó, không suy từ đoạn văn tóm tắt, và không tự bịa con số tổng." +
      // M1: đo trực tiếp trên log ai_queries của DAAB — một câu hỏi bằng ngôn ngữ tự
      // nhiên GỘP nhiều chỉ số ở nhiều bảng khác nhau trong MỘT lượt gọi (vd "so sánh
      // doanh số, hoàn tiền, tồn kho và bồi thường theo từng cửa hàng") gần như luôn
      // sinh SQL lỗi ở tầng dưới (JOIN sai, CTE trùng tên, cú pháp khoảng thời gian sai)
      // — tách thành NHIỀU lượt gọi, mỗi lượt một chỉ số/một bảng, rồi tự cộng gộp kết
      // quả lại gần như luôn thành công. Không đặc thù một connector nào — áp dụng cho
      // mọi công cụ truy vấn dữ liệu bằng ngôn ngữ tự nhiên.
      "Khi câu hỏi cần SO SÁNH NHIỀU chỉ số ở NHIỀU bảng/nguồn dữ liệu khác nhau, ĐỪNG gộp tất cả vào một lượt gọi công cụ — " +
      "hãy hỏi TỪNG chỉ số một qua các lượt gọi riêng biệt (mỗi lượt một bảng), rồi TỰ TỔNG HỢP kết quả lại thành câu trả lời cuối. " +
      // P1 (đặt tên khác F1 để tránh trùng, đo cùng đợt với M1): câu hỏi bằng ngôn ngữ
      // tự nhiên gửi cho công cụ truy vấn dữ liệu càng MƠ HỒ càng dễ bị tầng dưới hiểu
      // sai (bỏ sót điều kiện lọc, chọn nhầm ngưỡng gộp nhóm). Đã biết cấu trúc bảng
      // (từ bước mô tả bảng) thì nêu thẳng tên bảng/cột/điều kiện thay vì diễn đạt
      // chung chung.
      "Khi diễn đạt câu hỏi cho công cụ truy vấn dữ liệu bằng ngôn ngữ tự nhiên, hãy nêu CỤ THỂ tên bảng/cột và điều kiện lọc/gộp nhóm bạn đã biết (từ bước mô tả cấu trúc bảng trước đó) thay vì hỏi chung chung — câu hỏi càng cụ thể càng ít bị hiểu sai." +
      // R1: đo được model chọn nhầm tool audit RIÊNG của chính LAAM (đọc log hành động
      // của chính agent này, tiền tố laam_) cho câu hỏi về hoạt động NGHIỆP VỤ của
      // khách hàng/dữ liệu đã kết nối — chỉ vì tên tool có chữ "audit" khớp mặt chữ với
      // câu hỏi. Việc chỉ sửa mô tả tool KHÔNG đủ (đã thử, model vẫn chọn nhầm) nên nhắc
      // thẳng ở đây, cùng chỗ với các luật chọn-tool khác (F1/F3/M1).
      "Có một tool CHỈ đọc nhật ký hành động của CHÍNH agent này trong hệ thống LAAM (tên có tiền tố laam_) — " +
      "tool đó KHÔNG chứa dữ liệu nghiệp vụ của khách hàng hay data source đã kết nối. " +
      "Câu hỏi về hoạt động nghiệp vụ (giao dịch, override ngoài giờ, hoạt động nhạy cảm của khách hàng…) " +
      "PHẢI dùng công cụ truy vấn data source tương ứng, KHÔNG dùng tool audit riêng của LAAM." +
      // G1: chỉ voice — gỡ hiểu nhầm "nói ngắn ⇒ tra cứu ít" mà VOICE_GUIDE gây ra.
      // Đặt trong KHỐI TOOL (không trong VOICE_GUIDE) để đường không-tool vẫn sạch từ
      // ngữ tool. Câu cuối nhắm đúng lỗi đã đo: model coi một kết quả liệt kê tổng quan
      // là đã trả lời xong câu hỏi "chi tiết về X".
      (input.mode === "voice"
        ? " Yêu cầu nói ngắn gọn và không đọc ID ở trên CHỈ áp dụng cho câu chữ đọc lên: " +
          "KHÔNG được vì thế mà giảm số bước tra cứu, và vẫn phải dùng ID/UUID làm tham số khi gọi công cụ. " +
          "Khi người dùng hỏi chi tiết về một đối tượng cụ thể, một kết quả liệt kê tổng quan thường CHƯA đủ — " +
          "hãy tra tiếp bằng công cụ chi tiết rồi mới tóm tắt bằng lời."
        : "")
    : "";
  const guide = input.mode === "voice" ? VOICE_GUIDE : RENDER_GUIDE;
  return [base, `Hôm nay là ${date}.`, langHint, tools, guide].filter(Boolean).join(" ");
}
