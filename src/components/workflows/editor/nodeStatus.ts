// Map workflow run SSE step statuses to the editor's node-badge vocabulary.
//
// Rule 13: the SSE stream (see useWorkflowEvents / StepRecord) emits
// "running" | "succeeded" | "failed". The node badge in WfNodeCard wants
// "idle" | "running" | "success" | "error". These vocabularies LOOK alike but
// are NOT equal ("succeeded" ≠ "success", "failed" ≠ "error") — passing the raw
// SSE string through would silently never light the ✓/✕ badge. Map explicitly.

export type NodeRunStatus = "idle" | "running" | "success" | "error";

/** Translate one SSE step status → node-badge status. Unknown → "idle" (no badge). */
export function mapStepStatus(sse: string): NodeRunStatus {
  switch (sse) {
    case "running":
      return "running";
    case "succeeded":
      return "success";
    case "failed":
      return "error";
    default:
      return "idle";
  }
}

/** Fold a list of step events (last status per node wins) into a nodeId → status map. */
export function stepsToNodeStatuses(
  steps: ReadonlyArray<{ nodeId: string; status: string }>,
): Record<string, NodeRunStatus> {
  const out: Record<string, NodeRunStatus> = {};
  for (const s of steps) out[s.nodeId] = mapStepStatus(s.status);
  return out;
}

/**
 * Visual decoration for an edge, derived from its SOURCE node's status + the
 * overall run status:
 *  - animated: flow "lights up" along edges leaving running/finished nodes while a
 *    run is live (runStatus === "running"). Static otherwise (no marching ants idle).
 *  - errored: edge turns red when its source node failed.
 */
export function edgeRunDecoration(
  sourceStatus: NodeRunStatus,
  runStatus: string | null | undefined,
): { animated: boolean; errored: boolean } {
  return {
    animated: runStatus === "running" && (sourceStatus === "running" || sourceStatus === "success"),
    errored: sourceStatus === "error",
  };
}
