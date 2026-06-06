// Lớp persistence + SSE quanh engine thuần. Snapshot graph authored vào run
// (PIN-D4a). Mỗi step → row + publish bus. status cuối + context (capped).
// G1: persist run_step.input; foreach child gắn parentStepId; finalize FAILED khi
// engine THROW (budget/validate/foreach-not-array — không để run kẹt "running");
// onStep DB write fail-soft (insert lỗi tạm thời KHÔNG abort run; node-fail vẫn fail-stop).
// G2: tách executeRunRow (chạy engine trên 1 row CÓ SẴN — manual đã insert 'running',
// scheduled tickClaim insert 'queued'; executeRunRow flip→running rồi finalize).
import { eq } from "drizzle-orm";
import type { db as Db } from "@/db";
import { workflows, workflowRuns, workflowRunSteps } from "@/db/schema";
import type { BusEvent } from "@/lib/events-bus";
import { runWorkflow } from "./engine";
import { evalPredicate } from "./predicate";
import { emptyContext, DEFAULT_BUDGET } from "./types";
import type { RunContext, StepRecord, WfNode, Budget, WorkflowGraph } from "./types";

const MAX_OUTPUT_BYTES = 256 * 1024; // PIN-D4b — cap output persist, KHÔNG cắt context RAM

export function capForPersist(v: unknown): unknown {
  try {
    const s = JSON.stringify(v);
    if (s.length > MAX_OUTPUT_BYTES) return { _truncated: true, bytes: s.length, preview: s.slice(0, 1000) };
  } catch { /* non-serializable */ }
  return v;
}

// The shape capForPersist writes when output exceeds MAX_OUTPUT_BYTES (PIN-D4b). Exported
// so resume can detect a truncated journal value before it reaches interpolation (where a
// missing field would throw on an arg-sink or silently become "" on a text-sink).
export function isTruncatedMarker(v: unknown): v is { _truncated: true; bytes: number; preview: string } {
  return !!v && typeof v === "object" && (v as { _truncated?: unknown })._truncated === true;
}

export type ExecuteRunDeps = {
  db: typeof Db;
  publish: (e: BusEvent) => void;
  buildRunNode: (userId: string, opts?: { dryRun?: boolean }) => (node: WfNode, ctx: RunContext) => Promise<unknown>;
  budget?: Budget; // G1: cận chạy (mặc định DEFAULT_BUDGET)
};

export type ExecuteRunResult =
  | { ok: false; status: number; error: string }
  | { ok: true; run: { id: string; status: string }; steps: StepRecord[] };

// Một row workflow_run đã tồn tại trong DB (manual: vừa insert 'running'; scheduled:
// tickClaim insert 'queued'). executeRunRow chạy engine trên graphSnapshot của nó.
export type RunRow = {
  id: string;
  workflowId: string;
  userId: string;
  trigger: "manual" | "schedule";
  graphSnapshot: WorkflowGraph;
  /** Test/dry-run: connector WRITE actions are mocked (no real side-effects). */
  dryRun?: boolean;
};

export type ExecuteRunRowResult = { status: "succeeded" | "failed"; steps: StepRecord[] };

// Chạy engine trên 1 row CÓ SẴN: flip→running (idempotent cho manual) → engine →
// persist steps → finalize (succeeded/failed) → SSE. Trả về status cuối + steps.
export async function executeRunRow(runRow: RunRow, deps: ExecuteRunDeps): Promise<ExecuteRunRowResult> {
  const runId = runRow.id;
  const snapshot = runRow.graphSnapshot;

  // Chuyển queued→running (manual đã 'running' → no-op về mặt ngữ nghĩa). startedAt
  // set ở đây để cả 2 đường cùng có mốc bắt đầu khi engine thực sự chạy.
  await deps.db.update(workflowRuns)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(workflowRuns.id, runId));

  const steps: StepRecord[] = [];
  const stepRowId = new Map<string, string>(); // nodeId → row id (cập nhật tuần tự; foreach: ghi đè mỗi vòng, update bám row hiện tại)
  const onStep = async (s: StepRecord) => {
    // DB write fail-soft: lỗi insert/update tạm thời KHÔNG abort cả run (node-fail vẫn
    // fail-stop qua engine). Vẫn publish SSE để UI thấy tiến trình.
    try {
      if (s.status === "running") {
        const id = crypto.randomUUID();
        stepRowId.set(s.nodeId, id);
        // foreach child: parentNodeId → row id của foreach node (đã insert trước, tuần tự).
        const parentStepId = s.parentNodeId ? (stepRowId.get(s.parentNodeId) ?? null) : null;
        await deps.db.insert(workflowRunSteps).values({
          id, runId, nodeId: s.nodeId, parentStepId, seq: s.seq, kind: s.kind,
          status: "running", input: capForPersist(s.input), startedAt: new Date(),
        });
      } else {
        steps.push(s);
        // Update ĐÚNG row của node này (theo id) — KHÔNG where(runId) (sẽ clobber mọi step).
        const rowId = stepRowId.get(s.nodeId);
        if (rowId) {
          await deps.db.update(workflowRunSteps)
            .set({ status: s.status, output: capForPersist(s.output), error: s.error, finishedAt: new Date() })
            .where(eq(workflowRunSteps.id, rowId));
        }
      }
    } catch (e) {
      console.error(`[workflow] onStep DB write lỗi (fail-soft) run=${runId} node=${s.nodeId} status=${s.status}:`, e);
    }
    deps.publish({ type: "workflow_run_step", runId, nodeId: s.nodeId, seq: s.seq, status: s.status });
  };

  const runNode = deps.buildRunNode(runRow.userId, { dryRun: runRow.dryRun ?? false });
  const budget = deps.budget ?? DEFAULT_BUDGET;

  // A1 follow-up: engine THROW (budget/validate/foreach-not-array) → finalize FAILED,
  // KHÔNG để run kẹt "running". Node-fail bình thường trả EngineResult.status="failed".
  let finalStatus: "succeeded" | "failed";
  let finalError: string | undefined;
  let finalContext: unknown;
  try {
    const result = await runWorkflow(snapshot, { runNode, onStep, evalPredicate }, emptyContext({ source: runRow.trigger }), budget);
    finalStatus = result.status;
    finalError = result.error;
    finalContext = result.context;
  } catch (e) {
    finalStatus = "failed";
    finalError = e instanceof Error ? e.message : String(e);
    finalContext = undefined;
  }

  await deps.db.update(workflowRuns)
    .set({
      status: finalStatus,
      error: finalError,
      context: capForPersist(finalContext),
      finishedAt: new Date(),
    })
    .where(eq(workflowRuns.id, runId));
  deps.publish({ type: "workflow_run", runId, status: finalStatus });

  return { status: finalStatus, steps };
}

// Manual trigger: load workflow (ownership) + insert run row 'running' + executeRunRow.
export async function executeRun(
  input: { workflowId: string; userId: string; trigger: "manual" | "schedule"; dryRun?: boolean },
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
    dryRun: input.dryRun ?? false,
    graphSnapshot: snapshot,
    startedAt: new Date(),
  });

  const { status, steps } = await executeRunRow(
    { id: runId, workflowId: wf.id, userId: input.userId, trigger: input.trigger, graphSnapshot: snapshot, dryRun: input.dryRun },
    deps,
  );
  return { ok: true, run: { id: runId, status }, steps };
}
