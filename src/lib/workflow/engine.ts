// Bộ điều phối THUẦN: duyệt chain tuyến tính, gọi runNode (DI), truyền blackboard,
// phát StepRecord qua onStep, fail-stop. Validate trước khi chạy (spec §5.4/§5.5).
import type { WorkflowGraph, RunContext, StepRecord, WfNode } from "./types";
import { linearOrder } from "./validate";

export type EngineDeps = {
  runNode: (node: WfNode, ctx: RunContext) => Promise<unknown>;
  onStep: (step: StepRecord) => Promise<void>;
};

export type EngineResult = {
  status: "succeeded" | "failed";
  context: RunContext;
  failedNodeId?: string;
  error?: string;
};

export async function runWorkflow(graph: WorkflowGraph, deps: EngineDeps, ctx0: RunContext): Promise<EngineResult> {
  const order = linearOrder(graph); // throw nếu non-linear/cycle (cổng A0)
  const ctx = ctx0;
  let seq = 0;
  for (const node of order) {
    const base = { nodeId: node.id, kind: node.kind, seq };
    await deps.onStep({ ...base, status: "running" });
    try {
      const output = await deps.runNode(node, ctx);
      ctx.steps[node.id] = { output };
      await deps.onStep({ ...base, status: "succeeded", output });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await deps.onStep({ ...base, status: "failed", error });
      return { status: "failed", context: ctx, failedNodeId: node.id, error };
    }
    seq++;
  }
  return { status: "succeeded", context: ctx };
}
