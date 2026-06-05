import { db } from "@/db";
import { evalRuns, type EvalScenarioScore } from "@/db/schema";
import { aggregateDims } from "./report";
import type { ScenarioScore } from "./types";

type Meta = { k: number; model: string; at: string };
type Extra = { label?: string | null; gitSha?: string | null };

// Pure: shape an eval_run insert from a run's meta + scores. Tested without DB.
export function buildEvalRow(meta: Meta, scores: ScenarioScore[], extra: Extra = {}) {
  return {
    model: meta.model,
    k: meta.k,
    label: extra.label ?? null,
    gitSha: extra.gitSha ?? null,
    totalScenarios: scores.length,
    totalRuns: scores.length * meta.k,
    dims: aggregateDims(scores),
    scores: scores as unknown as EvalScenarioScore[],
  };
}

// Best-effort DB insert. Throws are the caller's to swallow (suite keeps the JSON).
export async function persistEvalRun(meta: Meta, scores: ScenarioScore[], extra: Extra = {}): Promise<void> {
  await db.insert(evalRuns).values(buildEvalRow(meta, scores, extra));
}
