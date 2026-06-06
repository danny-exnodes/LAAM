// Per-node idempotency for durable resume (P0a). Atomic claim via INSERT ON CONFLICT
// DO NOTHING RETURNING — a returned row means "I claimed it (execute the write)"; no row
// means "already claimed" → read stored status/output (replay or fail-loud). Deterministic
// key (runId,nodeId,iterIndex). NOT the harness nonce (audit_log has a 10-min window + no
// unique index — breaks multi-day sleep + TOCTOU). `withWriteIdempotency` is the WAL wrapper
// applied to EVERY write execution — initial run AND resume — so the table is the single
// source of truth for writes from run 1.
import { and, eq } from "drizzle-orm";
import { workflowNodeIdempotency } from "@/db/schema";
import { resolveKind } from "@/lib/agent/safety/policy";
import { INTERNAL_TOOLS } from "@/lib/agent/registry";
import type { RunContext, WfNode } from "./types";

type DB = typeof import("@/db").db;

export type IdemKey = { runId: string; nodeId: string; iterIndex: number };

export type ClaimResult =
  | { claimed: true } // I inserted the row → I execute the write
  | { claimed: false; status: "claimed" | "done"; output: unknown }; // someone already did

// Atomic claim. A returned row = we are the executor. Otherwise read the existing row's
// status/output (the conflicting row already exists). Replaces check-then-act (TOCTOU).
export async function claimNode(db: DB, key: IdemKey): Promise<ClaimResult> {
  const inserted = await db
    .insert(workflowNodeIdempotency)
    .values({ runId: key.runId, nodeId: key.nodeId, iterIndex: key.iterIndex })
    .onConflictDoNothing({
      target: [workflowNodeIdempotency.runId, workflowNodeIdempotency.nodeId, workflowNodeIdempotency.iterIndex],
    })
    .returning({ id: workflowNodeIdempotency.id });
  if (inserted.length > 0) return { claimed: true };

  const rows = await db
    .select({ status: workflowNodeIdempotency.status, output: workflowNodeIdempotency.output })
    .from(workflowNodeIdempotency)
    .where(
      and(
        eq(workflowNodeIdempotency.runId, key.runId),
        eq(workflowNodeIdempotency.nodeId, key.nodeId),
        eq(workflowNodeIdempotency.iterIndex, key.iterIndex),
      ),
    )
    .limit(1);
  const r = rows[0] ?? { status: "claimed", output: null };
  return { claimed: false, status: r.status as "claimed" | "done", output: r.output };
}

// Record the write's result and flip status → 'done'. Called AFTER the side-effect returns.
// If the process dies between claim and this call, the row stays 'claimed' with null output
// → resume reads that as "write may have committed → fail loud".
export async function recordNodeOutput(db: DB, key: IdemKey, output: unknown): Promise<void> {
  await db
    .update(workflowNodeIdempotency)
    .set({ status: "done", output })
    .where(
      and(
        eq(workflowNodeIdempotency.runId, key.runId),
        eq(workflowNodeIdempotency.nodeId, key.nodeId),
        eq(workflowNodeIdempotency.iterIndex, key.iterIndex),
      ),
    );
}

// foreach body runs N times under the same nodeId; the loop index lives in ctx.vars.index.
// Linear/non-foreach nodes have no index → 0.
export function iterIndexOf(ctx: RunContext): number {
  return typeof ctx.vars.index === "number" ? (ctx.vars.index as number) : 0;
}

// Only connector WRITE actions need idempotency (the send-once guard). Reads (agent /
// connector-read / condition / foreach) re-run safely. Unknown actions fail closed to write.
export function isWrite(node: WfNode): boolean {
  return node.kind === "connector" && resolveKind(node.action, INTERNAL_TOOLS) === "write";
}

export type WriteIdemDeps = {
  db: DB;
  runId: string;
  // DI for testing — default to the module impls in production.
  claimNode?: (db: DB, key: IdemKey) => Promise<ClaimResult>;
  recordNodeOutput?: (db: DB, key: IdemKey, output: unknown) => Promise<void>;
};

// F1 WAL: wrap a base runNode so every WRITE execution is idempotent — claim before the
// side-effect, record after. Applied to BOTH the initial run (executeRunRow) and resume
// (makeResumeRunNode). On any re-walk: a 'done' write replays its stored output (no re-send);
// a 'claimed'-but-unrecorded write (crash mid-send) fails loud rather than risk a double-send.
// Reads pass straight through. Engine A0 contract untouched (this is run-layer).
export function withWriteIdempotency(
  base: (node: WfNode, ctx: RunContext) => Promise<unknown>,
  deps: WriteIdemDeps,
): (node: WfNode, ctx: RunContext) => Promise<unknown> {
  const claim = deps.claimNode ?? claimNode;
  const record = deps.recordNodeOutput ?? recordNodeOutput;
  return async (node, ctx) => {
    if (!isWrite(node)) return base(node, ctx);
    const key: IdemKey = { runId: deps.runId, nodeId: node.id, iterIndex: iterIndexOf(ctx) };
    const c = await claim(deps.db, key);
    if (!c.claimed) {
      if (c.status === "done") return c.output; // replay — no re-send
      throw new Error(
        `node "${node.id}" iter ${key.iterIndex}: write was claimed but output not recorded ` +
          `(process crashed mid-send). Cannot safely continue — the external action may have committed. ` +
          `Run marked failed; manual intervention required.`,
      );
    }
    const out = await base(node, ctx); // execute the write exactly once
    await record(deps.db, key, out);
    return out;
  };
}
