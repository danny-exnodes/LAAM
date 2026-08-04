// Descriptor hiển thị cho Larvis: dữ liệu bảng/biểu đồ tách khỏi lời nói.
// THUẦN — không React, không I/O, không gọi model (Rule 5). Số liệu ở đây do CODE
// lấy từ tool result, không phải do model kể lại (Rule 13).
import { unwrapToolResult } from "@/lib/agent/drilldown";

export const MAX_ROWS = 50; // giữ trong descriptor; dài hơn thì cắt + ghi `truncated`
export const MAX_CHART_ROWS = 25; // trên mức này bar chart thành nhiễu, không gợi ý nữa

export type ViewDescriptor = {
  kind: "table" | "chart" | "record" | "stat";
  title: string;
  source: { type: "tool"; toolName: string; at: number } | { type: "model" };
  columns?: { key: string; label: string; align?: "left" | "right" }[];
  rows?: Record<string, unknown>[];
  chart?: { type: "bar" | "line" | "pie"; labelKey: string; valueKey: string };
  truncated?: { shown: number; total: number };
};

type Row = Record<string, unknown>;

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
function findRows(payload: unknown): Row[] | null {
  const direct = asRows(payload);
  if (direct) return direct;
  if (!isPlainObject(payload)) return null;
  for (const value of Object.values(payload)) {
    const nested = asRows(value);
    if (nested) return nested;
  }
  return null;
}

const isNumeric = (rows: Row[], key: string) =>
  rows.every((r) => typeof r[key] === "number" && Number.isFinite(r[key] as number));

const isLabel = (rows: Row[], key: string) => rows.every((r) => typeof r[key] === "string");

export function deriveFromToolResult(
  toolName: string,
  result: unknown,
  at: number,
): ViewDescriptor | null {
  const payload = unwrapToolResult(result);
  if (payload === null || payload === undefined) return null;

  const source = { type: "tool", toolName, at } as const;

  const found = findRows(payload);
  if (found) {
    const keys = Object.keys(found[0]);
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
      title: toolName,
      source,
      columns,
      rows,
      ...(chart ? { chart } : {}),
      ...(found.length > MAX_ROWS ? { truncated: { shown: MAX_ROWS, total: found.length } } : {}),
    };
  }

  if (isPlainObject(payload)) {
    const keys = Object.keys(payload);
    if (keys.length < 2) return null; // 1 field không đáng chiếm cả màn hình
    return {
      kind: "record",
      title: toolName,
      source,
      columns: keys.map((key) => ({ key, label: key })),
      rows: [payload],
    };
  }

  if (typeof payload === "number" && Number.isFinite(payload)) {
    return { kind: "stat", title: toolName, source, rows: [{ value: payload }] };
  }

  return null;
}

// Một lượt có nhiều tool result (drilldown list → detail, tối đa DEFAULT_MAX_ROUNDS
// vòng). Chỉ MỘT panel được hiện, và là cái CUỐI CÙNG có dạng bảng/biểu đồ: bước
// liệt kê chỉ là phương tiện lấy id, bước chi tiết mới là thứ người dùng hỏi.
export function pickTurnView(views: ViewDescriptor[]): ViewDescriptor | null {
  for (let i = views.length - 1; i >= 0; i--) {
    if (views[i].kind === "table" || views[i].kind === "chart") return views[i];
  }
  return views.length ? views[views.length - 1] : null;
}
