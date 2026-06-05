import type { Expect, GraderResult, RunTrace } from "../types";

// Với mỗi (tool, predicate): tồn tại MỘT lời gọi tool đó có args thoả predicate.
export function gradeArgs(trace: RunTrace, args: NonNullable<Expect["args"]>): GraderResult {
  const bad: string[] = [];
  for (const [name, pred] of Object.entries(args)) {
    const callsToTool = trace.calls.filter((c) => c.name === name);
    if (!callsToTool.length) { bad.push(`${name}: chưa gọi`); continue; }
    if (!callsToTool.some((c) => safe(pred, c.args))) {
      bad.push(`${name}: args sai (${callsToTool.map((c) => JSON.stringify(c.args)).join(" | ")})`);
    }
  }
  return { dim: "args", pass: bad.length === 0, detail: bad.length ? bad.join("; ") : undefined };
}

function safe(pred: (a: Record<string, unknown>) => boolean, a: Record<string, unknown>): boolean {
  try { return pred(a); } catch { return false; }
}
