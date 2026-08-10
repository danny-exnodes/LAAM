// Descriptor hiển thị cho Larvis: dữ liệu bảng/biểu đồ tách khỏi lời nói.
// THUẦN — không React, không I/O, không gọi model (Rule 5). Số liệu ở đây do CODE
// lấy từ tool result, không phải do model kể lại (Rule 13).
import { unwrapToolResult } from "@/lib/agent/drilldown";

// Rows carried in the descriptor. This is the PANEL's own ceiling, not the tool's — a point
// worth stating because "50 of 62" looked like the connector capping the query when it was this
// constant all along. It has to stay bounded (the descriptor crosses the wire and is held in
// message state; ~30 columns puts a 500-row table around 300KB), but 50 was low enough to cut a
// perfectly ordinary answer in half. Beyond the ceiling the descriptor records `truncated` and
// the panel says so rather than quietly showing a short table.
export const MAX_ROWS = 500;
// A panel is shown for a result whose SHAPE is tabular — several rows, more than one column.
//
// It used to require >=6000 chars AND >=10 rows. The size test came from a real concern: code
// cannot answer the semantic question "is this result worth looking at", and deriving a panel
// from every result surfaced incidental lookups (an id-by-name probe, a "not found") as if they
// were the answer. But bytes never did that work — a row floor does. What bytes did instead was
// exclude most real answers: a top-10 ranking of "name + number" is ~700 chars.
//
// Measured 2026-08-07 across 13 Larvis questions: only 2 cleared the byte floor. In the other
// 11 the numbers on screen were the model retyping the result, and it corrupted them — "Blood
// Pressure Cuff" became "Blood Pressure uff", "OatmealLarge" gained a space (which later sent
// an investigation chasing a product that appeared not to exist), one table lost a cell and
// repeated a row. Rule 13 exists for exactly this, and the gate kept it switched off.
//
// The original rationale was token cost: a big result the model copies out is expensive. That
// still holds, but it is no longer the point — the digest already removes the cost. The point
// is CORRECTNESS: rows on screen must come from the data, not from the model's memory of it.
// Small results are cheap to retype and just as easy to retype WRONG.
// Three, not two: a drilldown's intermediate step ("list" before "detail") and an internal
// listing are typically one or two rows, and panelling those puts a table on screen for a step
// the user did not ask about. Every real answer measured on 2026-08-07 had five rows or more.
export const PANEL_MIN_ROWS = 3;
export const PANEL_MIN_COLS = 2; // one column is a list, and prose says a list better
export const MAX_CHART_ROWS = 25; // trên mức này bar chart thành nhiễu, không gợi ý nữa

export type ViewDescriptor = {
  kind: "table" | "chart" | "record" | "stat";
  title: string;
  source: { type: "tool"; toolName: string; at: number } | { type: "model" };
  columns?: { key: string; label: string; align?: "left" | "right" }[];
  rows?: Record<string, unknown>[];
  chart?: { type: "bar" | "line" | "pie"; labelKey: string; valueKey: string };
  // How the tool read the request, when it had to interpret it (see NOTE_KEYS). Shown with the
  // table so an interpretation the user did not intend is visible rather than assumed.
  note?: string;
  truncated?: { shown: number; total: number };
};

export type Row = Record<string, unknown>;

const isPlainObject = (v: unknown): v is Row =>
  !!v && typeof v === "object" && !Array.isArray(v);

// Mảng "dạng bảng" = ≥2 object thuần CÙNG bộ khoá. Khác bộ khoá ⇒ không phải bảng:
// dựng bảng từ đó sẽ đẻ ra ô trống rải rác, trông như dữ liệu thiếu chứ không phải
// dữ liệu khác hình dạng.
function asRows(v: unknown): Row[] | null {
  if (!Array.isArray(v) || v.length < 2 || !v.every(isPlainObject)) return null;
  const keys = Object.keys(v[0] as Row);
  if (!keys.length) return null;
  const sig = keys.join(",");
  const same = (v as Row[]).every((r) => Object.keys(r).join(",") === sig);
  return same ? (v as Row[]) : null;
}

// Mảng bảng có thể nằm ngay ở gốc hoặc dưới một khoá bất kỳ ({ ok, stores: [...] }).
// Không neo cứng tên khoá — cùng tinh thần findEntities() của drilldown.ts.
//
// Đi SÂU nhiều cấp, duyệt theo BỀ RỘNG. Bản đầu chỉ dò MỘT cấp, và điều đó khiến hàm này
// KHÔNG BAO GIỜ thấy được kết quả của một tool truy vấn bất đồng bộ: hình dạng thật (đo
// 2026-08-06 trên bảng chat_tool_call) là { text: "<json>" } → sau unwrapToolResult là
// { status, natural_language_query, results: { columns, rows, row_count } }, tức các dòng
// nằm ở cấp HAI. Duyệt bề rộng để mảng NÔNG nhất vẫn thắng — payload một cấp giữ nguyên
// hành vi cũ, chỉ những payload trước đây trả null mới đổi.
const MAX_DEPTH = 5;

type Found = { rows: Row[]; container: Row | null };

function findRowsIn(payload: unknown): Found | null {
  let level: Array<{ node: unknown; container: Row | null }> = [{ node: payload, container: null }];
  for (let depth = 0; depth <= MAX_DEPTH && level.length; depth++) {
    for (const { node, container } of level) {
      const rows = asRows(node);
      if (rows) return { rows, container };
    }
    const next: Array<{ node: unknown; container: Row | null }> = [];
    for (const { node } of level) {
      if (isPlainObject(node)) for (const v of Object.values(node)) next.push({ node: v, container: node });
    }
    level = next;
  }
  return null;
}

function findRows(payload: unknown): Row[] | null {
  return findRowsIn(payload)?.rows ?? null;
}

// Same "what counts as a table" judgement, reused by digest.ts so the rows it removes from the
// model's copy are EXACTLY the rows the panel shows the user. Two different notions of "table"
// would mean digesting something the panel never displays — data gone from both places.
export function findRowsForDigest(payload: unknown): Found | null {
  return findRowsIn(payload);
}

// The real size of the result set, read from the sibling count field when the array we found is
// only part of it. Shared with digest.ts so the panel and the model are told the SAME total.
export function totalRowsOf(found: Found): number {
  return totalFromContainer(found.container, found.rows.length);
}

// The array we found is not always the whole answer: an async query tool caps how many rows it
// returns and reports the real size in a SIBLING field (measured: rows=50 next to row_count=62,
// because the caller asked for max_rows=50). Showing 50 with no note is exactly the silent
// truncation this file exists to avoid (Rule 12) — so read the sibling.
const COUNT_KEYS = ["row_count", "rowcount", "total", "total_count", "count"];

function totalFromContainer(container: Row | null, fallback: number): number {
  if (!container) return fallback;
  for (const [k, v] of Object.entries(container)) {
    if (COUNT_KEYS.includes(k.toLowerCase()) && typeof v === "number" && Number.isFinite(v)) {
      return Math.max(v, fallback);
    }
  }
  return fallback;
}

// A result usually carries its own column ORDER beside the rows ({ columns: [...], rows: [...] }).
// Object.keys(rows[0]) does NOT preserve it: the payload is JSON, and this connector serialises
// row keys alphabetically, so the table led with approving_manager_id / customer_id /
// days_after_purchase while refund_id and refund_amount sat off-screen to the right. Use the
// declared order when it covers the row, and keep any key it omits at the end so nothing is
// silently dropped.
function orderedKeys(container: Row | null, rowKeys: string[]): string[] {
  const declared = container?.columns;
  if (!Array.isArray(declared)) return rowKeys;
  const known = new Set(rowKeys);
  const ordered = declared.filter((c): c is string => typeof c === "string" && known.has(c));
  if (!ordered.length) return rowKeys;
  const seen = new Set(ordered);
  return [...ordered, ...rowKeys.filter((k) => !seen.has(k))];
}

// The question that produced the table. It is NOT in the args of the call that RETURNS the
// rows — for an async query tool those are just {id, wait_seconds}; the question travels in the
// result payload. Same generic key set as query arguments, so this stays connector-agnostic.
const QUESTION_KEYS = ["natural_language_query", "query", "question", "nl_query"];

// How the result was READ, when the tool had to interpret the request rather than answer it
// literally. A connector that reverses a ranking (because the measure is negative for a loss,
// so "the largest" is the most negative number) says so in a sibling field; without it the user
// sees a plausible table and no way to tell it answers the question they asked. Same
// generic-key-set idiom as QUESTION_KEYS/COUNT_KEYS above, so this stays connector-agnostic.
const NOTE_KEYS = ["ranking_note", "note"];

function noteFromContainer(container: Row | null): string | undefined {
  if (!container) return undefined;
  for (const [k, v] of Object.entries(container)) {
    if (NOTE_KEYS.includes(k.toLowerCase()) && typeof v === "string" && v.trim()) {
      return v.trim();
    }
  }
  return undefined;
}

function titleFromPayload(payload: unknown): string | null {
  if (!isPlainObject(payload)) return null;
  for (const k of QUESTION_KEYS) {
    const v = payload[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

const isNumeric = (rows: Row[], key: string) =>
  rows.every((r) => typeof r[key] === "number" && Number.isFinite(r[key] as number));

const isLabel = (rows: Row[], key: string) => rows.every((r) => typeof r[key] === "string");

// Is this result big enough to deserve its own panel? (see PANEL_MIN_* above)
export function worthShowing(result: unknown): boolean {
  const rows = findRows(unwrapToolResult(result));
  if (!rows || rows.length < PANEL_MIN_ROWS) return false;
  // Column count from the widest row, not the first: a row missing an optional key would
  // otherwise decide the shape for the whole result.
  const cols = rows.reduce((max, r) => Math.max(max, Object.keys(r).length), 0);
  return cols >= PANEL_MIN_COLS;
}

export function deriveFromToolResult(
  toolName: string,
  result: unknown,
  at: number,
  // Human title for the panel. Several panels in one turn all come from the same tool, so the
  // tool name alone labels them identically ("kg_query_datasource_status" x5) and tells the
  // reader nothing about which is which; the question that produced it does.
  title?: string,
): ViewDescriptor | null {
  const payload = unwrapToolResult(result);
  if (payload === null || payload === undefined) return null;

  const source = { type: "tool", toolName, at } as const;

  const hit = findRowsIn(payload);
  if (hit) {
    const found = hit.rows;
    const total = totalFromContainer(hit.container, found.length);
    const keys = orderedKeys(hit.container, Object.keys(found[0]));
    const rows = found.slice(0, MAX_ROWS);
    const columns = keys.map((key) => ({
      key,
      label: key,
      align: isNumeric(found, key) ? ("right" as const) : ("left" as const),
    }));
    const labelKey = keys.find((k) => isLabel(found, k));
    const valueKey = keys.find((k) => isNumeric(found, k));
    const chart =
      labelKey && valueKey && found.length <= MAX_CHART_ROWS
        ? ({ type: "bar", labelKey, valueKey } as const)
        : undefined;
    return {
      kind: "table",
      title: title || titleFromPayload(payload) || toolName,
      source,
      columns,
      rows,
      ...(chart ? { chart } : {}),
      ...(noteFromContainer(hit.container) ? { note: noteFromContainer(hit.container) } : {}),
      ...(total > rows.length ? { truncated: { shown: rows.length, total } } : {}),
    };
  }

  if (isPlainObject(payload)) {
    const keys = Object.keys(payload);
    // Chỉ đếm field có GIÁ TRỊ THẬT (khác null/undefined). Nhiều tool trả "not found"
    // dạng { hint: "...", master_record: null } — 2 field nhưng chỉ 1 cái có nội dung
    // (còn lại là hướng dẫn nội bộ cho MODEL, không phải dữ liệu cho user xem). Đếm cả
    // field null sẽ biến gợi ý nội bộ đó thành một "bảng" trông như dữ liệu thật.
    const meaningfulKeys = keys.filter((k) => payload[k] !== null && payload[k] !== undefined);
    if (meaningfulKeys.length < 2) return null; // <2 field có nội dung không đáng chiếm cả màn hình
    return {
      kind: "record",
      title: title || toolName,
      source,
      columns: keys.map((key) => ({ key, label: key })),
      rows: [payload],
    };
  }

  if (typeof payload === "number" && Number.isFinite(payload)) {
    // Cần `columns` dù chỉ 1 cột — DisplayPanel chỉ render bảng khi columns.length > 0
    // (xem DisplayPanel.tsx); thiếu nó thì panel rỗng trơn dù pointer vẫn nói có bảng.
    return {
      kind: "stat",
      title: title || toolName,
      source,
      columns: [{ key: "value", label: toolName, align: "right" as const }],
      rows: [{ value: payload }],
    };
  }

  return null;
}

// Identity of a rendered table, for dropping repeats. A turn — or a reloaded conversation —
// can contain the same query run more than once (measured: one question produced two identical
// 50/62 tables live, and a reloaded conversation stacked several). Shared by the live path and
// the reload path so both drop exactly the same repeats; two different rules would mean a table
// that disappears on refresh, or appears only on refresh.
// Deliberately NOT keyed on the title: the title is the question as phrased for the connector,
// and the model rephrases it between runs ("list all refunds…" / "Show all refund records…"), so
// identical data would slip through under two different names. What identifies a table is its
// DATA — same columns, same row count, same total, same first row.
export function viewKey(d: ViewDescriptor): string {
  return [
    d.kind,
    (d.columns ?? []).map((c) => c.key).join(","),
    d.rows?.length ?? 0,
    d.truncated?.total ?? 0,
    JSON.stringify(d.rows?.[0] ?? null),
  ].join("|");
}

// Một lượt có nhiều tool result (drilldown list → detail, tối đa DEFAULT_MAX_ROUNDS
// vòng). Chỉ MỘT panel được hiện: descriptor CUỐI CÙNG theo thời gian, bất kể kind.
// Trước đây ưu tiên table/chart hơn record/stat kể cả khi record mới hơn — sai với
// thực tế list→describe (describe trả về 1 object = record, nhưng là bước gần câu
// trả lời nhất). "Cuối cùng" luôn đúng hơn "table luôn thắng".
export function pickTurnView(views: ViewDescriptor[]): ViewDescriptor | null {
  return views.length ? views[views.length - 1] : null;
}
