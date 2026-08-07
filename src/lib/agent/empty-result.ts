// A data query that came back EMPTY is not proof the thing does not exist — it is proof
// that THIS phrasing found nothing. The model does not reliably keep that distinction:
// measured 2026-08-06 on the DAAB pharmacy demo, asked "Show duplicate refunds across
// stores", the model rephrased the question into "...where the same refund_id appears in
// multiple stores". refund_id is the primary key, so that query is empty by construction,
// and the turn answered "there are no duplicate refunds" — while three other phrasings of
// the same question returned 9, 12 and 18 rows. A confident all-clear on a fraud question
// is the worst possible failure, so this is handled in CODE rather than by asking the model
// again: context.ts already carries three prompt rules against rephrasing (P1/P2/P3) and
// the run above violated all three (Rule 5 — if code can decide it, code decides it).
//
// This does NOT block or retry anything. It appends one honest sentence to the tool result
// so the model cannot read emptiness as absence, and quotes the query text actually used so
// the answer can name the definition it tested.
//
// PURE — no I/O, no model calls (Rule 5). Connector-agnostic: nothing here knows about DAAB.

import { unwrapToolResult } from "@/lib/agent/drilldown";

// Keys a connector might use for "how many rows came back". Checked before the array scan
// because a truncated/paged result can carry a count without carrying the rows.
const COUNT_KEYS = ["row_count", "rowcount", "total", "total_count", "count", "n"];
// Keys whose value being an EMPTY array means "found nothing".
const ROW_KEYS = ["rows", "results", "items", "data", "records", "matches", "hits"];

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

// A result "found nothing" when a recognised count field is 0, or a recognised rows field is
// an empty array. Deliberately conservative: an unrecognised shape returns false, so an
// unfamiliar connector is left completely alone rather than annotated on a guess.
export function foundNothing(result: unknown): boolean {
  // An MCP tool result reaches here as { text: "<json>" } — client.ts flattens text blocks to
  // one string before the orchestrator sees anything. Without this the scan below read `text`
  // as a plain string, matched no key, and returned false, so this module never once fired on
  // a DAAB result: measured 2026-08-07, three of five runs of "Show duplicate refunds across
  // stores" answered "there are no duplicate refunds" off a 0-row result with nothing in the
  // conversation to stop them. unwrapToolResult is the same helper view.ts and drilldown.ts
  // already use for this shape.
  const payload = unwrapToolResult(result);
  if (Array.isArray(payload)) return payload.length === 0;
  if (!isRecord(payload)) return false;

  // An error is not an empty result — it has its own reporting path, and calling a failure
  // "found nothing" would be the very confusion this module exists to prevent.
  if (payload.error !== undefined) return false;

  for (const [k, v] of Object.entries(payload)) {
    const key = k.toLowerCase();
    if (COUNT_KEYS.includes(key) && typeof v === "number") return v === 0;
    if (ROW_KEYS.includes(key) && Array.isArray(v)) return v.length === 0;
    // One level of nesting: async query tools wrap the payload ({ status, results: {...} }).
    if (isRecord(v) && foundNothingShallow(v)) return true;
  }
  return false;
}

function foundNothingShallow(obj: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(obj)) {
    const key = k.toLowerCase();
    if (COUNT_KEYS.includes(key) && typeof v === "number") return v === 0;
    if (ROW_KEYS.includes(key) && Array.isArray(v)) return v.length === 0;
  }
  return false;
}

// The note is an instruction to the MODEL inside a tool result — never shown to the user
// verbatim. It states the epistemic limit and, when we know it, the exact query text used.
export function emptyResultNote(queryText?: string, userQuestion?: string): string {
  const asked = queryText?.trim();
  const rewritten = !!userQuestion?.trim() && !!asked && !sameQuestion(asked, userQuestion);
  return (
    "KHÔNG TÌM THẤY BẢN GHI NÀO với cách hỏi này" +
    (asked ? ` (đã hỏi: “${asked}”)` : "") +
    ". Đây KHÔNG phải bằng chứng rằng không tồn tại — chỉ là cách diễn đạt này không khớp gì. " +
    "Khi trả lời, hãy nói rõ bạn đã tìm theo cách hiểu nào và rằng không có kết quả theo cách hiểu ĐÓ; " +
    "TUYỆT ĐỐI không khẳng định chung chung kiểu “không có trường hợp nào” / “không phát hiện bất thường”. " +
    // ĐO ĐƯỢC 2026-08-07 (sweep lượt B, Q4): lệnh trên đã có tác dụng một nửa — model MỞ ĐẦU
    // đúng bằng cách hiểu nó đã thử, rồi NỐI THÊM "Vì vậy không có duplicate refunds trong hệ
    // thống hiện tại". Khai giới hạn xong lại bỏ giới hạn ở câu kết vẫn ra đúng lời trấn an
    // sai. Lệnh cấm chung chung không chặn được nên phải gọi thẳng tên hình dạng câu đó.
    "Mệnh đề giới hạn phải nằm TRONG câu kết luận, không phải chỉ ở câu mở đầu: " +
    "không được viết câu nào kiểu “Vì vậy / Do đó không có … trong hệ thống” sau khi đã nêu cách hiểu. " +
    (rewritten
      ? // Đòn bẩy đo được: cùng sweep đó, ĐÚNG lời người dùng "list duplicate refunds across
        // stores" xuống DAAB nguyên vẹn một lần và trả về 8 dòng, trong khi mọi định nghĩa do
        // model tự đặt đều ra 0 hoặc 2. Nên khi thứ trả về rỗng KHÔNG phải lời người dùng,
        // hỏi lại bằng lời họ không còn là gợi ý. Đây là lệnh cho MODEL tự gọi lại, không
        // phải code thay chữ (xem `decisions/nl-query-pinning-rejected` — thay chữ đã bị loại).
        `Cách hỏi trên là bản BẠN tự diễn đạt lại, không phải lời người dùng (“${userQuestion!.trim()}”). ` +
        "BẮT BUỘC gọi lại công cụ MỘT lần bằng ĐÚNG lời người dùng trước khi kết luận bất cứ điều gì."
      : // Đã hỏi đúng lời người dùng rồi mà vẫn rỗng — đòi hỏi lại nữa là bảo model lặp y
        // nguyên lời gọi vừa chạy, tức một vòng lặp không có điểm dừng.
        "Nếu câu hỏi của người dùng có thể hiểu theo cách khác, hãy nêu các cách hiểu có thể để người dùng chọn.")
  );
}

// So hai câu hỏi theo NGHĨA gõ ra, bỏ qua hoa/thường, khoảng trắng thừa và dấu câu cuối —
// model hay trả về đúng câu người dùng nhưng khác cách viết, và bắt nó gọi lại vì một dấu
// chấm là đúng cái vòng lặp vô ích ở trên.
function sameQuestion(a: string, b: string): boolean {
  const norm = (s: string) =>
    s.toLowerCase().replace(/\s+/g, " ").replace(/[.,;:!?…"'“”‘’]+$/g, "").trim();
  return norm(a) === norm(b);
}

// Extract the natural-language question the model sent, so the note can quote it. Accepts any
// arg key a connector might use — unknown shapes simply yield undefined and the note omits it.
const QUERY_ARG_KEYS = ["natural_language_query", "query", "question", "q", "nl_query", "prompt"];

export function queryTextFromArgs(args: unknown): string | undefined {
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch {
      return undefined;
    }
  }
  if (!isRecord(args)) return undefined;
  for (const k of QUERY_ARG_KEYS) {
    const v = args[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

// Attach the note to an empty result. Returns the result UNCHANGED when it is not empty or
// not a shape we recognise — so this can sit on every tool result without special-casing.
// `fallbackQueryText` is the question asked by an EARLIER call in the same turn. A two-step
// query tool submits the question, gets an id back, and returns the rows from a later poll
// whose args carry only that id — so at the moment the emptiness is visible, the question is
// one call behind. Without it the note drops to its weak branch on exactly the path that
// matters (measured 2026-08-07 in the UI: the mandatory re-ask had never run against DAAB).
export function annotateEmptyResult(
  result: unknown,
  args?: unknown,
  userQuestion?: string,
  fallbackQueryText?: string,
): unknown {
  if (!foundNothing(result)) return result;
  const note = emptyResultNote(queryTextFromArgs(args) ?? fallbackQueryText, userQuestion);
  if (Array.isArray(result)) return { _empty: true, rows: result, note };
  if (isRecord(result)) return { ...result, note };
  return result;
}
