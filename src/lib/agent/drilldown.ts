// D2 — bước tra cứu XÁC ĐỊNH nối sau một tool liệt kê ("list → detail").
//
// WHY: câu hỏi "chi tiết về <đối tượng>" thường cần HAI bước — liệt kê để lấy id, rồi
// đọc bản ghi chi tiết. Đo trên gpt-oss-120b với 60 tool khả dụng, model làm bước hai
// không ổn định: có lượt dừng luôn ở kết quả liệt kê (trả lời bằng đúng mấy trường tổng
// quan), có lượt đi tiếp bằng SAI tool. Bước hai vì thế do CODE quyết, không để model
// đoán (Rule 5 — dùng model cho phán đoán, không dùng cho định tuyến).
//
// Trigger KHÔNG đoán ý định người dùng: nó so khớp TÊN THẬT lấy từ chính kết quả tool
// vừa chạy (Rule 13 — tin dữ liệu do code lấy được, không tin model kể lại). Không có
// tên nào trong câu hỏi → không làm gì, nên câu "liệt kê…" không bị kéo thêm một lượt.
//
// LAAM KHÔNG biết gì về connector cụ thể: cặp tool khai báo ở env TOOL_DRILLDOWN_PAIRS
// (xem .env.example), code ở đây thuần generic.

export type DrilldownPair = {
  listTool: string; // tool liệt kê; kết quả của nó chứa danh sách entity
  idField: string; // khoá id trong mỗi entity
  nameField: string; // khoá tên trong mỗi entity — dùng để so khớp với câu hỏi
  detailTool: string; // tool đọc chi tiết sẽ được gọi tiếp
  idArg: string; // tên tham số của detailTool nhận id
};

export type DrilldownPlan = { name: string; args: Record<string, unknown> };

// Tên ngắn hơn ngưỡng này bị bỏ qua: một entity tên "An"/"v3" sẽ khớp bừa vào chữ bất
// kỳ trong câu hỏi và kéo về bản ghi sai — im lặng đi tiếp còn tệ hơn không làm gì.
export const MIN_NAME_CHARS = 3;

function isPair(v: unknown): v is DrilldownPair {
  const p = v as Partial<DrilldownPair> | null;
  return (
    !!p &&
    typeof p.listTool === "string" && !!p.listTool &&
    typeof p.idField === "string" && !!p.idField &&
    typeof p.nameField === "string" && !!p.nameField &&
    typeof p.detailTool === "string" && !!p.detailTool &&
    typeof p.idArg === "string" && !!p.idArg
  );
}

// Fail-soft (Rule 12 nhưng ở mức cấu hình): config hỏng chỉ TẮT tính năng này và log,
// không được làm chết cả đường chat.
export function parseDrilldownPairs(raw: string | undefined | null): DrilldownPair[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    const pairs = arr.filter(isPair);
    if (pairs.length !== arr.length) {
      console.warn("[drilldown] TOOL_DRILLDOWN_PAIRS: bỏ qua mục thiếu trường bắt buộc");
    }
    return pairs;
  } catch (e) {
    console.warn("[drilldown] TOOL_DRILLDOWN_PAIRS không phải JSON hợp lệ — tắt drilldown", e);
    return [];
  }
}

// MCP trả kết quả dạng { text: "<chuỗi JSON>" }; tool nội bộ trả object thuần. Nhận cả hai.
function unwrap(result: unknown): unknown {
  if (result && typeof result === "object" && typeof (result as { text?: unknown }).text === "string") {
    try {
      return JSON.parse((result as { text: string }).text);
    } catch {
      return null; // text không phải JSON → không có entity để khớp
    }
  }
  return result;
}

// Tìm mảng entity ở BẤT KỲ khoá nào (không neo cứng vào "projects"): mảng đầu tiên mà
// các phần tử có cả idField lẫn nameField dạng chuỗi.
function findEntities(payload: unknown, pair: DrilldownPair): Array<Record<string, unknown>> {
  const hasFields = (v: unknown) => {
    const o = v as Record<string, unknown> | null;
    return !!o && typeof o === "object" && typeof o[pair.idField] === "string" && typeof o[pair.nameField] === "string";
  };
  const candidates: unknown[] = Array.isArray(payload)
    ? [payload]
    : payload && typeof payload === "object"
      ? Object.values(payload as Record<string, unknown>)
      : [];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length && c.every(hasFields)) return c as Array<Record<string, unknown>>;
  }
  return [];
}

// Trả bước tra cứu tiếp theo, hoặc null khi không đủ chắc chắn. Mơ hồ (hai tên khớp dài
// bằng nhau) → null: thà để model tự xoay còn hơn code kéo về đúng-một-nửa dữ liệu sai.
export function planDrilldown(pair: DrilldownPair, result: unknown, userMessage: string): DrilldownPlan | null {
  const entities = findEntities(unwrap(result), pair);
  if (!entities.length) return null;
  const haystack = userMessage.toLowerCase();

  let best: { id: string; len: number } | null = null;
  let tie = false;
  for (const e of entities) {
    const name = String(e[pair.nameField]);
    if (name.trim().length < MIN_NAME_CHARS) continue;
    if (!haystack.includes(name.toLowerCase())) continue;
    if (!best || name.length > best.len) {
      best = { id: String(e[pair.idField]), len: name.length };
      tie = false;
    } else if (name.length === best.len) {
      tie = true; // hai tên khác nhau cùng độ dài cùng khớp → mơ hồ
    }
  }
  if (!best || tie) return null;
  return { name: pair.detailTool, args: { [pair.idArg]: best.id } };
}
