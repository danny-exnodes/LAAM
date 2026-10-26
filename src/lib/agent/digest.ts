// Large tabular tool results reach the MODEL as a digest — counts, columns, code-computed
// totals and a few sample rows — instead of every row.
//
// WHY (measured 2026-08-06, gpt-oss-120b). "Show every refund processed by X" returns 62 rows
// x 30 columns ≈ 40KB ≈ 16k tokens. Traced per round, that turn cost 103s: ~3s of cheap tool
// rounds, one 22s round emitting 3,702 tokens the moment the big result landed, and a 76s
// final round of which 41s elapsed before the first visible character while the model streamed
// reasoning. The same question with a small result finishes its final round in 1.9s. A bigger
// result in means longer thinking AND a longer answer: shown 62 rows, the model writes out 62
// rows — 3,225 output tokens of markdown table, in which it printed store "PH-1" for a row
// whose real value is "PH-001" (a store id that does not exist), and closed with "All 62
// records were returned" while showing 50.
//
// WHERE THIS IS APPLIED MATTERS MORE THAN WHAT IT DOES. It runs on the copy handed to the
// model and NOTHING else:
//   - `convo` keeps the raw results, so extractToolTurns persists raw rows to chat_tool_call;
//   - the conversation GET route rebuilds the tables from those raw rows on reload;
//   - deriveFromToolResult builds the live panel from the raw result.
// An earlier attempt digested the convo messages instead. That would have written digests into
// chat_tool_call, so a reloaded conversation could never show its tables again — the rows would
// sit in the database with no path back to the screen. Keep this on the wire copy only.
//
// PURE — no I/O, no model calls (Rule 5): the totals below are computed, not asked for. A total
// the model adds up from a 5-row sample is confidently wrong.
import { findRowsForDigest, totalRowsOf, type Row } from "./view";

// Only reduce results big enough for the cost above to apply. Below these, the raw result is
// cheaper to pass through than to explain, and reducing it would lose detail for no gain.
//
// Env-overridable so a deployment can tune — or escape — without a code change:
//   DIGEST_MIN_CHARS=999999   → effectively OFF (nothing is ever big enough)
//   DIGEST_SAMPLE_ROWS=20     → give the model more rows to answer detail questions directly
// Turning it off does NOT turn off the table: view.ts builds that from the raw result on a
// separate path. It only means the model receives every row again — and then retypes them,
// which is the 49-103s / 3,225-output-token behaviour this exists to remove. Treat it as an
// escape hatch, not an equal option.
const DEFAULTS = { minChars: 6000, minRows: 10, sampleRows: 5 };

// Invalid or absent → the default. A typo must not silently disable the reduction, so a
// non-positive or unparseable value is ignored rather than taken literally.
function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export const digestMinChars = (): number => envInt("DIGEST_MIN_CHARS", DEFAULTS.minChars);
export const digestMinRows = (): number => envInt("DIGEST_MIN_ROWS", DEFAULTS.minRows);
export const digestSampleRows = (): number => envInt("DIGEST_SAMPLE_ROWS", DEFAULTS.sampleRows);

type Aggregate = { min: number; max: number; sum: number };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

// Per-column numeric aggregates over EVERY row, so "how much in total" survives the reduction.
// A column is aggregated only when every value is a finite number — a mixed column would
// otherwise produce a total silently computed over a subset.
export function aggregateRows(rows: Row[]): Record<string, Aggregate> {
  const out: Record<string, Aggregate> = {};
  if (!rows.length) return out;
  for (const key of Object.keys(rows[0])) {
    const values = rows.map((r) => r[key]);
    if (!values.every((v) => typeof v === "number" && Number.isFinite(v))) continue;
    const nums = values as number[];
    out[key] = {
      min: Math.min(...nums),
      max: Math.max(...nums),
      sum: Number(nums.reduce((a, b) => a + b, 0).toFixed(6)),
    };
  }
  return out;
}

// Two different situations, two different truths — conflating them is how the assistant ends up
// either lying or refusing:
//   complete (tool returned every matching row): the panel below the answer IS the whole table.
//   capped   (tool returned fewer than matched): the panel is partial, and the way to get the
//            rest is a BIGGER limit, not a narrower filter. An earlier version of this note said
//            "call again with a narrower filter" in both cases; asked "show me the full table",
//            the model followed that advice into a dead end and answered "the tool only returned
//            a sample, I can't show the full table" — refusing a request the data can satisfy.
function digestNote(total: number, shown: number, returned: number): string {
  const capped = total > returned;
  const head =
    `Đây là BẢN RÚT GỌN. Truy vấn khớp ${total} dòng, công cụ trả về ${returned} dòng, ` +
    `và chỉ ${shown} dòng mẫu được đưa vào ngữ cảnh của bạn. `;
  const panel = capped
    ? `Người dùng ĐANG NHÌN THẤY một bảng ${returned}/${total} dòng dựng sẵn dưới câu trả lời — ` +
      "bạn không cần chép lại bảng đó. "
    : "Người dùng ĐANG NHÌN THẤY bảng ĐẦY ĐỦ dựng sẵn dưới câu trả lời — bạn không cần chép lại nó. ";
  const warn = capped
    ? `LƯU Ý: ${returned} KHÔNG phải tổng số — tổng thật là ${total}; đừng nói "có ${returned} bản ghi". `
    : "";
  const more = capped
    ? `Nếu người dùng muốn xem ĐỦ CẢ ${total} dòng, hãy gọi LẠI công cụ với giới hạn số dòng lớn hơn ` +
      `(đủ cho ${total} dòng). ĐỪNG trả lời rằng bạn không thể hiển thị — dữ liệu có sẵn, chỉ cần hỏi lại rộng hơn. `
    : "Nếu người dùng muốn lọc hẹp hơn, hãy gọi lại công cụ với điều kiện cụ thể họ nêu. ";
  return (
    head +
    warn +
    panel +
    "Các số ở `aggregates` do HỆ THỐNG tính trên các dòng công cụ đã trả về — hãy dùng chúng, đừng tự cộng từ mẫu. " +
    "Hãy trả lời bằng NHẬN ĐỊNH và SỐ TỔNG HỢP, KHÔNG chép lại từng dòng: bạn không có đủ dòng để chép, " +
    "và chép từ mẫu sẽ tạo ra một danh sách thiếu trông như đầy đủ. " +
    more
  );
}

// Replace the biggest tabular array in a result with a digest. Returns the value UNCHANGED
// when it is small, not tabular, or an error — safe to apply to every tool result without
// knowing which connector produced it.
export function digestToolResult(result: unknown): unknown {
  if (isRecord(result) && result.error !== undefined) return result;
  let json: string;
  try {
    json = JSON.stringify(result) ?? "";
  } catch {
    return result;
  }
  if (json.length < digestMinChars()) return result;

  const hit = findRowsForDigest(result);
  if (!hit || hit.rows.length < digestMinRows()) return result;
  const { rows, container } = hit;
  // The array is not always the whole result set: an async query tool caps what it returns and
  // reports the real size beside it (measured: rows=50 next to row_count=62). Dropping that
  // sibling — which the first version of this file did — makes the model state the partial
  // count as the answer, replacing one wrong number with another.
  const total = totalRowsOf(hit);
  const sampleRows = digestSampleRows();

  const digest = {
    _digest: true,
    row_count: total,
    rows_returned_by_tool: rows.length,
    columns: Object.keys(rows[0]),
    aggregates: aggregateRows(rows),
    sample: rows.slice(0, sampleRows),
    note: digestNote(total, Math.min(sampleRows, rows.length), rows.length),
  };
  if (!isRecord(result)) return digest;

  // Keep the surrounding fields (status, sql, the question…) and drop only the array we
  // replaced, so nothing else the model relies on disappears.
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(result)) {
    if (v === container || containsRows(v, rows)) continue;
    rest[k] = v;
  }
  return { ...rest, ...digest };
}

function containsRows(value: unknown, rows: Row[]): boolean {
  if (value === rows) return true;
  if (Array.isArray(value)) return value.length === rows.length && value[0] === rows[0];
  if (isRecord(value)) return Object.values(value).some((v) => containsRows(v, rows));
  return false;
}

// A tool message's content is the JSON text of its result. Digest it in place, leaving
// anything unparseable exactly as it was.
export function digestToolMessageContent(content: string): string {
  if (content.length < digestMinChars()) return content;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return content; // not JSON (a nudge, a repeat-feedback string) → leave alone
  }
  // The wire payload of an MCP tool wraps the real result in { text: "<json>" }. Digest what
  // is inside the wrapper, then put it back, so the shape the model sees never changes.
  if (isRecord(parsed) && typeof parsed.text === "string") {
    let inner: unknown;
    try {
      inner = JSON.parse(parsed.text);
    } catch {
      return content;
    }
    const reduced = digestToolResult(inner);
    if (reduced === inner) return content;
    return JSON.stringify({ ...parsed, text: JSON.stringify(reduced) });
  }
  const reduced = digestToolResult(parsed);
  return reduced === parsed ? content : JSON.stringify(reduced);
}

// Every place a message list crosses to a model goes through this. There is more than one such
// place — the tool rounds call the model from inside the loop, while the FINAL answer is
// streamed from the route — and digesting only the first is the same as not digesting at all,
// because the final round is where the rows get retyped (measured: prompt still 19,476 tokens
// and the answer still 2,739 output tokens of table).
export function digestMessagesForModel<T extends { role: string; content?: string }>(messages: T[]): T[] {
  return messages.map((m) =>
    m.role === "tool" ? { ...m, content: digestToolMessageContent(m.content ?? "") } : m,
  );
}
