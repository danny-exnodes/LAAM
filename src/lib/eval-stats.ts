import type { EvalRun, EvalDims, EvalScenarioScore } from "@/db/schema";

// Overall reliability = total passed / total graded across ALL dimensions (honest;
// includes write-intent — annotated in the UI, not cherry-picked). 0 if nothing graded.
export function overallOf(dims: EvalDims): number {
  let p = 0, t = 0;
  for (const c of Object.values(dims)) { p += c.passed; t += c.total; }
  return t ? Math.round((100 * p) / t) : 0;
}

function pctOf(c: { passed: number; total: number } | undefined): number | null {
  return c && c.total ? Math.round((100 * c.passed) / c.total) : null;
}

export type TrendPoint = { run: string; overall: number; perDim: Record<string, number | null> };
export type EvalDashboard = {
  headline: { overallPct: number; deltaVsPrev: number | null; ranAt: Date; label: string | null; model: string } | null;
  trend: TrendPoint[];
  latest: { scores: EvalScenarioScore[]; dims: EvalDims } | null;
  runs: { id: string; ranAt: Date; label: string | null; model: string; overallPct: number }[];
};

const DIMS = ["tool-selection", "args", "grounding", "restraint", "termination", "write-intent", "rich-block"];

// rows: DESC by ranAt (newest first), as the /eval page queries them.
export function buildEvalDashboard(rows: EvalRun[]): EvalDashboard {
  if (!rows.length) return { headline: null, trend: [], latest: null, runs: [] };
  const [latest, prev] = rows;
  const latestPct = overallOf(latest.dims);
  const asc = [...rows].reverse();
  return {
    headline: {
      overallPct: latestPct,
      deltaVsPrev: prev ? latestPct - overallOf(prev.dims) : null,
      ranAt: latest.ranAt,
      label: latest.label,
      model: latest.model,
    },
    trend: asc.map((r) => ({
      run: r.label || r.ranAt.toISOString().slice(5, 10), // label preferred, else MM-DD
      overall: overallOf(r.dims),
      perDim: Object.fromEntries(DIMS.map((d) => [d, pctOf(r.dims[d])])),
    })),
    latest: { scores: latest.scores, dims: latest.dims },
    runs: rows.map((r) => ({ id: r.id, ranAt: r.ranAt, label: r.label, model: r.model, overallPct: overallOf(r.dims) })),
  };
}
