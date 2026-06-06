// Crash-resume spine (P0a). Continues a run interrupted by a crash, on the SAME runId.
// Rebuilds RunContext from the run_step journal (fail-loud on a truncated WRITE producer),
// then re-walks the frozen graphSnapshot with a resume-aware runNode (write-idempotency WAL +
// completed-read skip) and a resume-aware onStep (no duplicate rows for already-succeeded
// nodes). The engine A0 contract is untouched — all resume logic lives in the run-layer.
import { and, eq, inArray } from "drizzle-orm";
import { workflowRuns, workflowRunSteps } from "@/db/schema";
import { runWorkflow } from "./engine";
import { evalPredicate } from "./predicate";
import { rebuildContext, type JournalStep } from "./resume-context";
import { withWriteIdempotency, isWrite, iterIndexOf, type IdemKey, type ClaimResult } from "./idempotency";
import { capForPersist } from "./run";
import type { RunContext, StepRecord, WfNode, WorkflowGraph } from "./types";

type DB = typeof import("@/db").db;

export type ResumeRunNodeDeps = {
  db: DB;
  runId: string;
  seen: Set<string>; // nodeIds already succeeded (iterIndex 0)
  journaled: Map<string, unknown>; // nodeId → journaled output (completed reads)
  // DI passthrough to the write-idempotency wrapper (tests inject; prod uses module impls).
  claimNode?: (db: DB, key: IdemKey) => Promise<ClaimResult>;
  recordNodeOutput?: (db: DB, key: IdemKey, output: unknown) => Promise<void>;
};

// Resume runNode = write-idempotency (shared WAL) + completed-read skip (resume-only).
export function makeResumeRunNode(
  base: (node: WfNode, ctx: RunContext) => Promise<unknown>,
  deps: ResumeRunNodeDeps,
): (node: WfNode, ctx: RunContext) => Promise<unknown> {
  const idem = withWriteIdempotency(base, {
    db: deps.db,
    runId: deps.runId,
    claimNode: deps.claimNode,
    recordNodeOutput: deps.recordNodeOutput,
  });
  return async (node, ctx) => {
    if (isWrite(node)) return idem(node, ctx);
    if (iterIndexOf(ctx) === 0 && deps.seen.has(node.id)) return deps.journaled.get(node.id); // completed read
    return base(node, ctx);
  };
}

export type ResumeDeps = {
  db: DB;
  publish: (e: { type: string; runId: string; nodeId?: string; seq?: number; status?: string }) => void;
  buildRunNode: (userId: string, opts?: { dryRun?: boolean }) => (node: WfNode, ctx: RunContext) => Promise<unknown>;
};

// Continue a crashed run from its journal. Returns the final status.
export async function resumeRunRow(
  runId: string,
  deps: ResumeDeps,
): Promise<{ status: "succeeded" | "failed"; error?: string }> {
  const runs = await deps.db.select().from(workflowRuns).where(eq(workflowRuns.id, runId)).limit(1);
  const run = runs[0] as { id: string; userId: string; trigger: string; graphSnapshot: WorkflowGraph } | undefined;
  if (!run) return { status: "failed", error: "run not found" };

  await deps.db.update(workflowRuns).set({ status: "running" }).where(eq(workflowRuns.id, runId));
  // Clean stale step rows from the crashed attempt → no stuck 'running' row, no duplicate node.
  await deps.db
    .update(workflowRunSteps)
    .set({ status: "skipped" })
    .where(and(eq(workflowRunSteps.runId, runId), inArray(workflowRunSteps.status, ["running", "failed"])));

  const stepRows = await deps.db
    .select({
      nodeId: workflowRunSteps.nodeId,
      kind: workflowRunSteps.kind,
      status: workflowRunSteps.status,
      output: workflowRunSteps.output,
      seq: workflowRunSteps.seq,
    })
    .from(workflowRunSteps)
    .where(and(eq(workflowRunSteps.runId, runId), eq(workflowRunSteps.status, "succeeded")));

  // Attach each connector node's action (from the snapshot) for read/write classification.
  const nodeById = new Map(run.graphSnapshot.nodes.map((n) => [n.id, n]));
  const journalSteps: JournalStep[] = [...stepRows]
    .sort((a, b) => a.seq - b.seq)
    .map((r) => {
      const n = nodeById.get(r.nodeId);
      return {
        nodeId: r.nodeId,
        kind: r.kind as JournalStep["kind"],
        action: n && n.kind === "connector" ? n.action : undefined,
        status: r.status,
        output: r.output,
      };
    });

  const { ctx, hazards } = rebuildContext({ source: run.trigger }, journalSteps);

  // A truncated committed WRITE cannot be reconstructed → fail loud, never walk (Rule 12).
  const fail = hazards.find((h) => h.resolution === "fail");
  if (fail) {
    const error =
      `resume aborted: node "${fail.nodeId}" is a committed WRITE whose output was truncated at 256KB; ` +
      `context cannot be reconstructed to resume safely. Re-run from scratch or intervene manually.`;
    await deps.db.update(workflowRuns).set({ status: "failed", error, finishedAt: new Date() }).where(eq(workflowRuns.id, runId));
    deps.publish({ type: "workflow_run", runId, status: "failed" });
    return { status: "failed", error };
  }
  if (hazards.length > 0) {
    console.warn(
      `[workflow] resume run=${runId}: ${hazards.length} truncated READ producer(s) will re-run:`,
      hazards.map((h) => h.nodeId),
    );
  }

  const hazardIds = new Set(hazards.map((h) => h.nodeId));
  const seen = new Set(journalSteps.filter((s) => !hazardIds.has(s.nodeId)).map((s) => s.nodeId));
  const journaled = new Map(journalSteps.filter((s) => seen.has(s.nodeId)).map((s) => [s.nodeId, s.output] as const));

  const base = deps.buildRunNode(run.userId);
  const runNode = makeResumeRunNode(base, { db: deps.db, runId, seen, journaled });

  const stepRowId = new Map<string, string>();
  const onStep = async (s: StepRecord) => {
    // Already-succeeded top-level node → keep its original journal row, skip the re-write.
    if (s.parentNodeId === undefined && seen.has(s.nodeId)) return;
    try {
      if (s.status === "running") {
        const id = crypto.randomUUID();
        stepRowId.set(s.nodeId, id);
        const parentStepId = s.parentNodeId ? (stepRowId.get(s.parentNodeId) ?? null) : null;
        await deps.db.insert(workflowRunSteps).values({
          id,
          runId,
          nodeId: s.nodeId,
          parentStepId,
          seq: s.seq,
          kind: s.kind,
          status: "running",
          input: capForPersist(s.input),
          startedAt: new Date(),
        });
      } else {
        const rowId = stepRowId.get(s.nodeId);
        if (rowId) {
          await deps.db
            .update(workflowRunSteps)
            .set({ status: s.status, output: capForPersist(s.output), error: s.error, finishedAt: new Date() })
            .where(eq(workflowRunSteps.id, rowId));
        }
      }
    } catch (e) {
      console.error(`[workflow] resume onStep DB write (fail-soft) run=${runId} node=${s.nodeId}:`, e);
    }
    deps.publish({ type: "workflow_run_step", runId, nodeId: s.nodeId, seq: s.seq, status: s.status });
  };

  let status: "succeeded" | "failed";
  let error: string | undefined;
  try {
    const result = await runWorkflow(run.graphSnapshot, { runNode, onStep, evalPredicate }, ctx);
    status = result.status;
    error = result.error;
  } catch (e) {
    status = "failed";
    error = e instanceof Error ? e.message : String(e);
  }
  await deps.db
    .update(workflowRuns)
    .set({ status, error, context: capForPersist(ctx), finishedAt: new Date() })
    .where(eq(workflowRuns.id, runId));
  deps.publish({ type: "workflow_run", runId, status });
  return { status, error };
}
