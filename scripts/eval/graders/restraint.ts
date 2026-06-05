import type { GraderResult, RunTrace } from "../types";

export function gradeRestraint(trace: RunTrace, notCalls: string[]): GraderResult {
  const got = new Set(trace.calls.map((c) => c.name));
  const violated = notCalls.filter((n) => got.has(n));
  return {
    dim: "restraint",
    pass: violated.length === 0,
    detail: violated.length ? `gọi tool không nên: ${violated.join(", ")}` : undefined,
  };
}
