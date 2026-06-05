// Lớp persistence + SSE quanh engine thuần. Snapshot graph authored vào run
// (PIN-D4a). Mỗi step → row + publish bus. status cuối + context (capped).
import { eq } from "drizzle-orm";
import type { db as Db } from "@/db";
import { workflows, workflowRuns, workflowRunSteps } from "@/db/schema";
import type { BusEvent } from "@/lib/events-bus";
import { runWorkflow } from "./engine";
import { emptyContext } from "./types";
import type { RunContext, StepRecord, WfNode } from "./types";

const MAX_OUTPUT_BYTES = 256 * 1024; // PIN-D4b — cap output persist, KHÔNG cắt context RAM

function capForPersist(v: unknown): unknown {
  try {
    const s = JSON.stringify(v);
    if (s.length > MAX_OUTPUT_BYTES) return { _truncated: true, bytes: s.length, preview: s.slice(0, 1000) };
  } catch { /* non-serializable */ }
  return v;
}

export type ExecuteRunDeps = {
  db: typeof Db;
  publish: (e: BusEvent) => void;
  buildRunNode: (userId: string) => (node: WfNode, ctx: RunContext) => Promise<unknown>;
};

export type ExecuteRunResult =
  | { ok: false; status: number; error: string }
  | { ok: true; run: { id: string; status: string }; steps: StepRecord[] };

export async function executeRun(
  input: { workflowId: string; userId: string; trigger: "manual" | "schedule" },
  deps: ExecuteRunDeps,
): Promise<ExecuteRunResult> {
  const rows = await deps.db.select().from(workflows).where(eq(workflows.id, input.workflowId)).limit(1);
  const wf = rows[0];
  if (!wf || wf.userId !== input.userId) return { ok: false, status: 404, error: "không tìm thấy workflow" };

  const runId = crypto.randomUUID();
  const snapshot = wf.graph; // PIN-D4a: kế hoạch authored, tĩnh
  await deps.db.insert(workflowRuns).values({
    id: runId,
    workflowId: wf.id,
    userId: input.userId,
    trigger: input.trigger,
    status: "running",
    graphSnapshot: snapshot,
    startedAt: new Date(),
  });

  const steps: StepRecord[] = [];
  const stepRowId = new Map<string, string>(); // nodeId → row id (A0: nodeId duy nhất trong 1 run)
  const onStep = async (s: StepRecord) => {
    if (s.status === "running") {
      const id = crypto.randomUUID();
      stepRowId.set(s.nodeId, id);
      await deps.db.insert(workflowRunSteps).values({
        id, runId, nodeId: s.nodeId, seq: s.seq, kind: s.kind, status: "running", startedAt: new Date(),
      });
    } else {
      steps.push(s);
      // Update ĐÚNG row của node này (theo id) — KHÔNG where(runId) (sẽ clobber mọi step).
      await deps.db.update(workflowRunSteps)
        .set({ status: s.status, output: capForPersist(s.output), error: s.error, finishedAt: new Date() })
        .where(eq(workflowRunSteps.id, stepRowId.get(s.nodeId)!));
    }
    deps.publish({ type: "workflow_run_step", runId, nodeId: s.nodeId, seq: s.seq, status: s.status });
  };

  const runNode = deps.buildRunNode(input.userId);
  const result = await runWorkflow(snapshot, { runNode, onStep }, emptyContext({ source: input.trigger }));

  await deps.db.update(workflowRuns)
    .set({
      status: result.status,
      error: result.error,
      context: capForPersist(result.context),
      finishedAt: new Date(),
    })
    .where(eq(workflowRuns.id, runId));
  deps.publish({ type: "workflow_run", runId, status: result.status });

  return { ok: true, run: { id: runId, status: result.status }, steps };
}
