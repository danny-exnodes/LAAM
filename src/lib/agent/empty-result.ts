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
export function foundNothing(payload: unknown): boolean {
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
export function emptyResultNote(queryText?: string): string {
  const asked = queryText?.trim();
  return (
    "KHÔNG TÌM THẤY BẢN GHI NÀO với cách hỏi này" +
    (asked ? ` (đã hỏi: “${asked}”)` : "") +
    ". Đây KHÔNG phải bằng chứng rằng không tồn tại — chỉ là cách diễn đạt này không khớp gì. " +
    "Khi trả lời, hãy nói rõ bạn đã tìm theo cách hiểu nào và rằng không có kết quả theo cách hiểu ĐÓ; " +
    "TUYỆT ĐỐI không khẳng định chung chung kiểu “không có trường hợp nào” / “không phát hiện bất thường”. " +
    "Nếu câu hỏi của người dùng có thể hiểu theo cách khác, hãy thử lại bằng chính lời người dùng, " +
    "hoặc nêu các cách hiểu có thể để người dùng chọn."
  );
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
export function annotateEmptyResult(result: unknown, args?: unknown): unknown {
  if (!foundNothing(result)) return result;
  const note = emptyResultNote(queryTextFromArgs(args));
  if (Array.isArray(result)) return { _empty: true, rows: result, note };
  if (isRecord(result)) return { ...result, note };
  return result;
}
