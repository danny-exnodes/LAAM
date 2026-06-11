// In-app notifications (F2) — the SINGLE write chokepoint for the bell.
//
// create() is the only entry point that produces a notification: it inserts the
// row (collapsing repeats on dedupeKey via the partial-unique index) and then
// publishes a per-user `notification` event on the in-process events-bus. The SSE
// route (/api/events) fans that event ONLY to clients whose principal === userId —
// a SEPARATE channel from the org-shared `sessions` broadcast (the team value-prop
// MUST NOT be narrowed). Callers MUST go through create() so there is one source of
// truth and no double-notify.
//
// Scope this round: per-user, in-app only. The schema reserves `audience` for a
// future role-broadcast fan-out; it is not implemented here.

import { and, count, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import type { Notification } from "@/db/schema";
import { publish } from "@/lib/events-bus";

export type CreateNotification = {
  userId: string;
  type: string;
  severity?: "info" | "warn" | "error";
  title: string;
  body?: string | null;
  link?: string | null;
  source: "workflow" | "chat" | "system";
  dedupeKey?: string | null;
};

/**
 * Create-and-publish a notification. Inserts the row; on a (userId, dedupeKey)
 * conflict the existing row is touched (createdAt bumped to "now") instead of a
 * second row — so a repeated terminal event surfaces once, freshly. Either way the
 * resulting row is published as a per-user `notification` SSE event.
 *
 * The publish carries the recipient `userId` at the top level so the SSE route can
 * route it to that user's clients alone (the per-user channel). Publishing the
 * fresh DB row (Rule 13: code-derived ground truth) — never a caller-shaped guess.
 */
export async function create(n: CreateNotification): Promise<Notification> {
  const now = new Date();
  const rows = await db
    .insert(notifications)
    .values({
      userId: n.userId,
      type: n.type,
      severity: n.severity ?? "info",
      title: n.title,
      body: n.body ?? null,
      link: n.link ?? null,
      source: n.source,
      dedupeKey: n.dedupeKey ?? null,
    })
    // Dedupe: the partial-unique index is on (userId, dedupeKey) WHERE dedupeKey IS
    // NOT NULL. On conflict, re-surface the existing notification (bump createdAt,
    // clear readAt so it re-alerts) rather than insert a duplicate. When dedupeKey
    // is null the index never matches, so this clause is a no-op (plain insert).
    .onConflictDoUpdate({
      target: [notifications.userId, notifications.dedupeKey],
      // Match the PARTIAL unique index predicate explicitly so Postgres resolves
      // the right constraint (future-proof if another (userId,dedupeKey) index is
      // ever added). Without it the upsert relies on there being exactly one such
      // index — correct today, fragile later (review I-1).
      targetWhere: sql`${notifications.dedupeKey} is not null`,
      set: { createdAt: now, readAt: null, severity: n.severity ?? "info", title: n.title, body: n.body ?? null, link: n.link ?? null },
    })
    .returning();

  const row = rows[0];
  publish({ type: "notification", userId: row.userId, notification: row });
  return row;
}

/** A user's notifications, newest-first. `unreadOnly` filters to readAt IS NULL. */
export async function listForUser(
  userId: string,
  opts: { unreadOnly?: boolean; limit?: number } = {},
): Promise<Notification[]> {
  const where = opts.unreadOnly
    ? and(eq(notifications.userId, userId), isNull(notifications.readAt))
    : eq(notifications.userId, userId);
  return db
    .select()
    .from(notifications)
    .where(where)
    .orderBy(desc(notifications.createdAt))
    .limit(opts.limit ?? 50);
}

/** Count of unread notifications for the bell badge. */
export async function unreadCount(userId: string): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(rows[0]?.n ?? 0);
}

/**
 * Mark one (`id`) or all (`'all'`) of a user's notifications read. Always scoped to
 * userId so a caller can never mark another user's notification read. Idempotent.
 */
export async function markRead(userId: string, id: string | "all"): Promise<void> {
  const now = new Date();
  const where =
    id === "all"
      ? and(eq(notifications.userId, userId), isNull(notifications.readAt))
      : and(eq(notifications.userId, userId), eq(notifications.id, id));
  await db.update(notifications).set({ readAt: now }).where(where);
}

/** Housekeeping: delete notifications older than `days` (any read state). */
export async function pruneOld(days: number): Promise<void> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  await db.delete(notifications).where(lt(notifications.createdAt, cutoff));
}

// --- Wire adapters (the workflow run/resume chokepoints call these) ----------
// Server-side notifications can't reach the React i18n provider, so titles use the
// app's canonical server language (Vietnamese), matching the existing server-string
// convention (e.g. chat route error text). The bell renders these verbatim.

const WF_TITLE: Record<"succeeded" | "failed" | "cancelled", string> = {
  succeeded: "Workflow chạy xong",
  failed: "Workflow thất bại",
  cancelled: "Workflow đã hủy",
};

/**
 * Map a workflow-terminal event to a notification (F2). ONE call per run via the
 * dedupeKey `wfrun:<runId>` (a re-publish on the same run upserts, never duplicates).
 * Deep-links to the run. severity: failed → error, else info.
 */
export function notifyWorkflowTerminal(n: {
  userId: string;
  workflowId: string;
  runId: string;
  status: "succeeded" | "failed" | "cancelled";
}): Promise<Notification> {
  return create({
    userId: n.userId,
    type: "workflow_run",
    severity: n.status === "failed" ? "error" : "info",
    title: WF_TITLE[n.status],
    link: `/workflows/${n.workflowId}?run=${n.runId}`,
    source: "workflow",
    dedupeKey: `wfrun:${n.runId}`,
  });
}

/**
 * Notify a chat user that a write tool is awaiting their confirmation (F2). Called
 * fire-and-forget from the chat write-gate suspend point — the pending_write frame
 * already drives the in-chat card; this surfaces it in the bell too (single source
 * = the gate, no separate detector). dedupeKey collapses repeats of the same tool in
 * the same conversation so the bell isn't spammed while a proposal is pending.
 */
export function notifyWritePending(n: {
  userId: string;
  conversationId: string;
  tool: string;
  title: string;
}): Promise<Notification> {
  return create({
    userId: n.userId,
    type: "write_pending",
    severity: "warn",
    title: n.title,
    // /chat doesn't deep-link to a conversation yet — link to the chat surface where
    // the confirm card lives. (Deep-link is a future enhancement, not this round.)
    link: `/chat`,
    source: "chat",
    dedupeKey: `writepending:${n.conversationId}:${n.tool}`,
  });
}
