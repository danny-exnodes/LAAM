import type { Expect, GraderResult, RunTrace } from "../types";
import { contains } from "../util";

export function gradeGrounding(trace: RunTrace, e: Pick<Expect, "finalContains" | "finalNotContains">): GraderResult {
  const text = trace.finalText;
  const missing = (e.finalContains ?? []).filter((t) => !contains(text, t));
  const leaked = (e.finalNotContains ?? []).filter((t) => contains(text, t));
  const detail = [
    missing.length ? `thiếu: ${missing.join(", ")}` : "",
    leaked.length ? `bịa/không nên có: ${leaked.join(", ")}` : "",
  ].filter(Boolean).join("; ");
  return { dim: "grounding", pass: !missing.length && !leaked.length, detail: detail || undefined };
}
