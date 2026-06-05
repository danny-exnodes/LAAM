import type { GraderResult, RunTrace } from "../types";

export function gradeTermination(trace: RunTrace, maxRounds: number): GraderResult {
  const pass = trace.rounds <= maxRounds;
  return { dim: "termination", pass, detail: pass ? undefined : `${trace.rounds} tool-round > ngưỡng ${maxRounds}` };
}
