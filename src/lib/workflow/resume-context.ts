// Pure: rebuild RunContext from the run_step journal for crash-resume. Detects truncated
// producer outputs (PIN-D4b) and classifies them: READ → re-run (leave out of ctx so the
// walker re-executes the node and repopulates it); WRITE → fail-loud hazard (a committed
// write cannot be safely re-run, and its truncated journal lacks the real fields downstream
// interpolation needs). The exact-suspend (sleep) path does NOT use this — its suspendedContext
// is uncapped, so it has no truncation hazard.
import { isTruncatedMarker } from "./run";
import { resolveKind } from "@/lib/agent/safety/policy";
import { INTERNAL_TOOLS } from "@/lib/agent/registry";
import type { RunContext } from "./types";

export type JournalStep = {
  nodeId: string;
  kind: "agent" | "connector" | "condition" | "foreach" | "delay";
  action?: string; // connector action (for read/write classification)
  status: string; // only 'succeeded' rows are replayed into ctx
  output: unknown;
};

export type ResumeHazard = {
  nodeId: string;
  kind: JournalStep["kind"];
  action?: string;
  action_class: "read" | "write";
  resolution: "rerun" | "fail";
};

// agent/condition/foreach/delay have no external side-effect → 'read'. connector → policy.
function classifyNode(s: JournalStep): "read" | "write" {
  if (s.kind === "connector" && s.action) return resolveKind(s.action, INTERNAL_TOOLS) === "write" ? "write" : "read";
  return "read";
}

export function rebuildContext(
  trigger: Record<string, unknown>,
  succeededSteps: JournalStep[],
): { ctx: RunContext; hazards: ResumeHazard[] } {
  const ctx: RunContext = { trigger, steps: {}, vars: {} };
  const hazards: ResumeHazard[] = [];
  for (const s of succeededSteps) {
    if (s.status !== "succeeded") continue;
    if (isTruncatedMarker(s.output)) {
      const action_class = classifyNode(s);
      hazards.push({
        nodeId: s.nodeId,
        kind: s.kind,
        action: s.action,
        action_class,
        resolution: action_class === "read" ? "rerun" : "fail",
      });
      // READ: leave out of ctx → the walker re-runs and repopulates with full output.
      // WRITE: also left out, but resumeRunRow aborts before walking (never interpolates it).
      continue;
    }
    ctx.steps[s.nodeId] = { output: s.output };
  }
  return { ctx, hazards };
}
