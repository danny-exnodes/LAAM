// Single-machine orphan detection (P0a). At app boot, any run still 'running' was orphaned
// by the crash — the only executor process just (re)started, so nothing is actively running
// it. Mark such runs 'resumable' so the tick poke claims + resumes them (tickResume).
// PRECONDITION: a single app PROCESS (not just single host). Multi-worker deployments would
// need a lease/heartbeat; the workflow_node_idempotency WAL is the backstop against a
// mis-fired sweep re-running a write (it would replay, not re-send).
// DEPLOY NOTE: runs already 'running' when P0a is FIRST deployed predate the WAL (no idempotency
// rows) → resuming them could re-send a committed write. Drain in-flight runs before the first
// P0a deploy (see CHANGELOG). All runs created after P0a carry WAL rows, so steady state is safe.
import { eq } from "drizzle-orm";
import { workflowRuns } from "@/db/schema";

type DB = typeof import("@/db").db;

export async function sweepOrphanedRuns(db: DB): Promise<number> {
  const res = await db.update(workflowRuns).set({ status: "resumable" }).where(eq(workflowRuns.status, "running"));
  return (res as { rowCount?: number }).rowCount ?? 0;
}
