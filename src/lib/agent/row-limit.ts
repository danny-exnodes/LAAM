// Raise the row limit a query tool was called with, so the table the user sees is the whole
// answer instead of the first page of it.
//
// WHY NOW. A connector's tool description can tell the model to cap what it asks for — the one
// measured here says "ALWAYS pass max_rows=50 unless the user explicitly needs more" — advice
// that exists to protect the MODEL's context. Measured 2026-08-06: the user asked "show every
// refund processed by X", the model asked for 50, the query matched 62, and the answer reported
// a 50-row total while the panel could only ever show 50 of 62. Twelve rows were unreachable.
//
// That advice is now obsolete on this path: the model no longer receives the rows (digest.ts
// replaces them with counts, code-computed aggregates and a five-row sample), so a bigger result
// no longer costs it anything. The rows go to the panel, which is built by code. Asking for the
// full set became cheap exactly when digesting started.
//
// CONNECTOR-AGNOSTIC. LAAM must not know any connector's argument names (same rule as
// TOOL_DATA_FETCH / TOOL_DRILLDOWN_PAIRS), so the argument to raise comes from env:
//   TOOL_ROW_LIMIT_ARGS=max_rows,limit      ← names to look for
//   TOOL_ROW_LIMIT=1000                     ← what to raise them to
// Unset ⇒ nothing is touched and behaviour is exactly as before.
//
// PURE — no I/O, no model calls (Rule 5).

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

function limitArgNames(): string[] {
  return (process.env.TOOL_ROW_LIMIT_ARGS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// The ceiling is a CAP, not a request: an argument already asking for more is left alone, so a
// deliberate larger request is never quietly reduced.
function limitCeiling(): number {
  const n = Number(process.env.TOOL_ROW_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function rowLimitEnabled(): boolean {
  return limitArgNames().length > 0 && limitCeiling() > 0;
}

// Raise any configured row-limit argument the model set below the ceiling. Arguments it did not
// set are left ABSENT rather than injected: a tool whose default is "everything" would be turned
// into a capped one by adding the argument, which is the opposite of the point.
export function raiseRowLimit(args: unknown): unknown {
  const names = limitArgNames();
  const ceiling = limitCeiling();
  if (!names.length || !ceiling || !isRecord(args)) return args;

  let changed = false;
  const out: Record<string, unknown> = { ...args };
  for (const name of names) {
    const v = out[name];
    if (typeof v === "number" && Number.isFinite(v) && v < ceiling) {
      out[name] = ceiling;
      changed = true;
    }
  }
  return changed ? out : args;
}
