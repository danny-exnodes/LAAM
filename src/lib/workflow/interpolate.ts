// {{path}} = tra cứu property THUẦN vào RunContext. KHÔNG eval/Function/số học (spec
// §5.2 PIN-D3a). Hợp đồng theo SINK (CTO 06-05): sink 'text' = total→string (scalar=
// String, object=JSON.stringify, kể cả sole-token); sink 'arg' = sole-token giữ TYPE,
// embedded scalar coerce, embedded object FAIL-LOUD.
import type { RunContext } from "./types";

const TOKEN = /\{\{\s*([^}]+?)\s*\}\}/g;
const SOLE = /^\{\{\s*([^}]+?)\s*\}\}$/;

// Walk dotted path. KHÔNG bracket-index (PIN-D3b): "a[0]" là 1 segment literal.
// Trả { found, value } để phân biệt undefined-thật với missing.
export function resolvePath(path: string, ctx: RunContext): { found: boolean; value: unknown } {
  const segs = path.split(".").map((s) => s.trim()).filter(Boolean);
  let cur: unknown = ctx;
  for (const s of segs) {
    if (cur == null || typeof cur !== "object") return { found: false, value: undefined };
    if (!(s in (cur as Record<string, unknown>))) return { found: false, value: undefined };
    cur = (cur as Record<string, unknown>)[s];
  }
  return { found: true, value: cur };
}

function isScalar(v: unknown): boolean {
  return v == null || typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

// sink:"text" → LUÔN string (scalar=String, object=JSON.stringify; sole-token & embedded).
// sink:"arg"  → sole-token giữ TYPE; embedded scalar coerce; embedded object/missing THROW.
export function resolveTemplate(tpl: string, ctx: RunContext, sink: "arg" | "text"): unknown {
  const sole = tpl.match(SOLE);
  if (sole) {
    const { found, value } = resolvePath(sole[1], ctx);
    if (!found) {
      if (sink === "arg") throw new Error(`interpolation: missing path "${sole[1]}"`);
      console.warn(`[workflow] interpolation missing "${sole[1]}" → ""`);
      return "";
    }
    if (sink === "arg") return value; // arg sole-token: giữ nguyên TYPE (rủi ro lõi PIN-D3a)
    // text sink = total→string: stringify MỘT chỗ (CTO 06-05), KHÔNG giữ type.
    return isScalar(value) ? (value == null ? "" : String(value)) : JSON.stringify(value);
  }
  // embedded → build string
  return tpl.replace(TOKEN, (_m, p1: string) => {
    const { found, value } = resolvePath(p1.trim(), ctx);
    if (!found) {
      if (sink === "arg") throw new Error(`interpolation: missing path "${p1.trim()}"`);
      console.warn(`[workflow] interpolation missing "${p1.trim()}" → ""`);
      return "";
    }
    if (isScalar(value)) return value == null ? "" : String(value);
    if (sink === "text") return JSON.stringify(value);
    throw new Error(`interpolation: cannot embed object in connector arg ("${p1.trim()}") — dùng sole-token`);
  });
}

// Deep-interpolate connector args (sink "arg"): mỗi string value → resolveTemplate.
export function interpolateArgs(args: Record<string, unknown>, ctx: RunContext): Record<string, unknown> {
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return resolveTemplate(v, ctx, "arg");
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  return walk(args) as Record<string, unknown>;
}
