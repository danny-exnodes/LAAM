// Guardrail tối thiểu. KHÔNG thêm dependency (tự viết validator).
import type { Tool } from "./types";

type JsonSchema = {
  type?: string;
  properties?: Record<string, { type?: string }>;
  required?: string[];
};

export function validateArgs(
  parameters: object,
  args: unknown,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (args != null && (typeof args !== "object" || Array.isArray(args)))
    return { ok: false, error: "args phải là object" };
  const obj = (args ?? {}) as Record<string, unknown>;
  const schema = (parameters ?? {}) as JsonSchema;
  // Coi chuỗi rỗng như "thiếu" cho field required (id rỗng vô nghĩa) — cố ý lệch khỏi JSON Schema chuẩn.
  for (const key of schema.required ?? []) {
    const v = obj[key];
    if (v === undefined || v === null || v === "") return { ok: false, error: `thiếu tham số bắt buộc: ${key}` };
  }
  for (const [key, def] of Object.entries(schema.properties ?? {})) {
    const v = obj[key];
    if (v === undefined || v === null) continue;
    const want = def.type;
    if (!want) continue;
    const okType =
      (want === "string" && typeof v === "string") ||
      (want === "number" && typeof v === "number") ||
      (want === "boolean" && typeof v === "boolean") ||
      (want === "array" && Array.isArray(v)) ||
      (want === "object" && typeof v === "object" && !Array.isArray(v));
    if (!okType) return { ok: false, error: `tham số ${key} phải là ${want}` };
  }
  return { ok: true, value: obj };
}

// P1 quick-tools: requestedTool từ picker đi qua CÙNG chuẩn validateArgs như
// internal tools — fail-fast tại trust boundary /api/chat thay vì để args hỏng
// (thiếu required / sai kiểu) trôi xuống connector handler. Trả null khi body
// không mang requestedTool (đường chat thường).
export function checkRequestedTool(
  rt: { name?: unknown; args?: unknown } | null | undefined,
  tools: { function: { name: string; parameters: object } }[],
): { ok: true; value: { name: string; args: Record<string, unknown> } } | { ok: false; error: string } | null {
  if (!rt || typeof rt !== "object") return null;
  const name = typeof rt.name === "string" ? rt.name : "";
  const tool = name ? tools.find((t) => t.function.name === name) : undefined;
  if (!tool) return { ok: false, error: `Tool không khả dụng: ${name || "(thiếu tên)"}` };
  const v = validateArgs(tool.function.parameters, rt.args ?? {});
  if (!v.ok) return { ok: false, error: `Tham số không hợp lệ cho ${name}: ${v.error}` };
  return { ok: true, value: { name, args: v.value } };
}

// Chỉ dẫn cho MODEL khi kết quả bị rút gọn — bảo nó thu hẹp truy vấn rồi gọi lại,
// thay vì bó tay/bịa. (Đây là instruction tới model trong tool-result, không hiển thị
// trực tiếp cho người dùng.)
const TRUNCATE_NOTE =
  "Kết quả quá lớn nên đã RÚT GỌN — đây KHÔNG phải dữ liệu đầy đủ. Để lấy ĐÚNG dữ liệu cần, " +
  "hãy gọi LẠI công cụ với phạm vi hẹp hơn: giảm 'limit', thêm bộ lọc (vd status/sort/owner/repo/query), " +
  "hoặc dùng công cụ tổng hợp/tìm kiếm chuyên biệt. TUYỆT ĐỐI không suy đoán phần đã bị rút gọn.";

// Lấy các phần tử ĐẦU của mảng sao cho JSON gói gọn trong `budget` ký tự (giữ ít nhất 1
// nếu vừa). Mỗi phần tử giữ NGUYÊN VẸN (JSON hợp lệ) — khác hẳn slice-giữa-chuỗi.
function headWithinBudget(arr: unknown[], budget: number): unknown[] {
  const out: unknown[] = [];
  let used = 2; // dấu []
  for (const item of arr) {
    let len: number;
    try { len = JSON.stringify(item)?.length ?? 0; } catch { continue; }
    if (out.length > 0 && used + len + 1 > budget) break;
    out.push(item);
    used += len + 1;
  }
  return out;
}

function largestArrayKey(obj: Record<string, unknown>): string | null {
  let key: string | null = null;
  let best = -1;
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v) && v.length > best) { key = k; best = v.length; }
  }
  return key;
}

// Giới hạn kích thước tool-result trước khi vào ngữ cảnh model. KHI VƯỢT NGƯỠNG: KHÔNG
// slice chuỗi JSON (tạo JSON HỎNG model không parse được → bó tay → "Dữ liệu bị cắt ngắn"),
// mà trả một MẪU hợp lệ (vài phần tử đầu của mảng lớn nhất) + tổng số + chỉ dẫn thu hẹp —
// để model gọi lại đúng phạm vi và hoàn tất chuỗi.
export function boundOutput(result: unknown, maxBytes = 8192): unknown {
  if (result === undefined) return { error: "handler không trả về dữ liệu" };
  let json: string;
  try {
    json = JSON.stringify(result);
  } catch {
    return { error: "kết quả không serialize được" };
  }
  if (json.length <= maxBytes) return result;

  // (a) result là mảng → giữ phần tử đầu.
  if (Array.isArray(result)) {
    const sample = headWithinBudget(result, maxBytes - 320);
    return { _truncated: true, total: result.length, shown: sample.length, sample, note: TRUNCATE_NOTE };
  }
  // (b) result là object có field mảng → cắt mảng DÀI NHẤT, GIỮ các field khác (vd totals).
  if (result && typeof result === "object") {
    const obj = result as Record<string, unknown>;
    const key = largestArrayKey(obj);
    if (key) {
      const arr = obj[key] as unknown[];
      const rest = { ...obj };
      delete rest[key];
      let restLen = 0;
      try { restLen = JSON.stringify(rest).length; } catch { restLen = 0; }
      const sample = headWithinBudget(arr, Math.max(400, maxBytes - restLen - 320));
      return {
        ...rest,
        _truncated: true,
        [`${key}__total`]: arr.length,
        [`${key}__shown`]: sample.length,
        [key]: sample,
        note: TRUNCATE_NOTE,
      };
    }
  }
  // (c) object/chuỗi khổng lồ không có mảng để cắt → preview text, ĐÁNH DẤU rõ là không đầy đủ.
  return { _truncated: true, bytes: json.length, note: TRUNCATE_NOTE, previewText: json.slice(0, 1200) };
}

export function guard(tool: Tool): Tool {
  return {
    ...tool,
    handler: async (args, ctx) => {
      const v = validateArgs(tool.parameters, args);
      if (!v.ok) return { error: v.error };
      const out = await tool.handler(v.value, ctx);
      return boundOutput(out);
    },
  };
}
