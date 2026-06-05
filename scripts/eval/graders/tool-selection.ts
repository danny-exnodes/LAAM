import type { GraderResult, RunTrace } from "../types";

export function gradeToolSelection(trace: RunTrace, callsTool: string | string[]): GraderResult {
  const want = Array.isArray(callsTool) ? callsTool : [callsTool];
  const got = new Set(trace.calls.map((c) => c.name));
  const missing = want.filter((w) => !got.has(w));
  return {
    dim: "tool-selection",
    pass: missing.length === 0,
    detail: missing.length ? `thiếu gọi: ${missing.join(", ")} (đã gọi: ${[...got].join(", ") || "—"})` : undefined,
  };
}
