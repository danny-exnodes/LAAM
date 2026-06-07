// Monitoring read-model (feature B). A normalized "monitored runs" view over the
// THREE separate stores — agent_sessions (transcript local/claude + external
// api/mcp), chat_conversations, workflow_runs — WITHOUT merging them physically
// (a hard merge would be lossy). Pure normalizers + a per-source visibility
// filter; the DB query layer composes them.
//
// Q2 invariant (machines-decomposition): visibility is PER SOURCE, never
// flattened to one level — org-shared sources (local/claude/api/mcp) are visible
// to every authenticated user; chat/workflow are visible only to their principal.
import { and, desc, eq, inArray, sum } from "drizzle-orm";
import { db } from "@/db";
import {
  agentSessions,
  chatConversations,
  chatMessages,
  workflowRuns,
  workflows,
} from "@/db/schema";

export type MonitoredSource = "local" | "claude" | "chat" | "workflow" | "api" | "mcp";

/** Sources that belong to the whole org (anyone logged-in may view). */
export const ORG_SHARED_SOURCES: ReadonlySet<MonitoredSource> = new Set([
  "local",
  "claude",
  "api",
  "mcp",
]);
/** agent_sessions can hold any of these source values. */
const AGENT_SOURCES: MonitoredSource[] = ["local", "claude", "api", "mcp"];

export type MonitoredRun = {
  id: string;
  source: MonitoredSource;
  title: string;
  principal: string | null; // userId (provenance); null for transcript rows
  status: string | null;
  startedAt: string | null; // ISO
  lastActivity: string | null; // ISO
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  machineId: string | null;
};

export type Viewer = { userId: string; role: string };

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

// ── Pure normalizers ──────────────────────────────────────────────────────────

export function normalizeAgentSession(r: {
  id: string;
  source: string;
  userId: string | null;
  status: string | null;
  latestActivity: string | null;
  machineId: string | null;
  startedAt: Date | null;
  lastActivity: Date | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}): MonitoredRun {
  return {
    id: r.id,
    source: r.source as MonitoredSource,
    title: r.latestActivity || r.id,
    principal: r.userId ?? null,
    status: r.status,
    startedAt: iso(r.startedAt),
    lastActivity: iso(r.lastActivity),
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
    costUsd: r.costUsd,
    machineId: r.machineId,
  };
}

export function normalizeChatConversation(
  r: { id: string; userId: string; title: string; createdAt: Date | null; updatedAt: Date | null },
  tokens?: { tokensIn: number; tokensOut: number },
): MonitoredRun {
  return {
    id: r.id,
    source: "chat",
    title: r.title,
    principal: r.userId,
    status: null,
    startedAt: iso(r.createdAt),
    lastActivity: iso(r.updatedAt),
    tokensIn: tokens?.tokensIn ?? 0,
    tokensOut: tokens?.tokensOut ?? 0,
    costUsd: 0, // local model is free ($0) — see project ethos
    machineId: null,
  };
}

export function normalizeWorkflowRun(r: {
  id: string;
  userId: string;
  workflowName: string | null;
  status: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}): MonitoredRun {
  return {
    id: r.id,
    source: "workflow",
    title: r.workflowName || r.id,
    principal: r.userId,
    status: r.status,
    startedAt: iso(r.startedAt),
    lastActivity: iso(r.finishedAt ?? r.startedAt ?? r.createdAt),
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
    costUsd: r.costUsd,
    machineId: null,
  };
}

// ── Visibility (Q2) + merge ─────────────────────────────────────────────────────

export function isVisible(run: MonitoredRun, viewer: Viewer): boolean {
  if (ORG_SHARED_SOURCES.has(run.source)) return true;
  return run.principal === viewer.userId;
}

export function mergeAndSort(runs: MonitoredRun[], limit: number): MonitoredRun[] {
  return [...runs]
    .sort((a, b) => {
      const ta = a.lastActivity ? Date.parse(a.lastActivity) : -Infinity;
      const tb = b.lastActivity ? Date.parse(b.lastActivity) : -Infinity;
      return tb - ta;
    })
    .slice(0, limit);
}

// ── Query layer ─────────────────────────────────────────────────────────────────

export type MonitoringQuery = { source?: MonitoredSource; limit?: number };

/**
 * The unified list, already filtered for `viewer`. Each source is queried with
 * its own visibility WHERE (chat/workflow scoped to the viewer); org-shared
 * sources are unscoped. `isVisible` is re-applied as a defense-in-depth guard.
 */
export async function getMonitoredRuns(
  viewer: Viewer,
  q: MonitoringQuery = {},
): Promise<MonitoredRun[]> {
  const limit = Math.min(q.limit ?? 100, 200);
  const want = (s: MonitoredSource) => !q.source || q.source === s;
  const agentSrc = AGENT_SOURCES.filter(want);

  // The three sources are independent — run them in parallel (not sequentially)
  // so the request waits on max(query) rather than the sum.
  const [agentRuns, chatRuns, workflowRunsOut] = await Promise.all([
    // agent_sessions (org-shared sources)
    (async (): Promise<MonitoredRun[]> => {
      if (!agentSrc.length) return [];
      const rows = await db
        .select()
        .from(agentSessions)
        .where(inArray(agentSessions.source, agentSrc))
        .orderBy(desc(agentSessions.lastActivity))
        .limit(limit);
      return rows.map((r) => normalizeAgentSession(r as never));
    })(),

    // chat_conversations (per-user) + per-conversation token aggregate
    (async (): Promise<MonitoredRun[]> => {
      if (!want("chat")) return [];
      const convos = await db
        .select()
        .from(chatConversations)
        .where(eq(chatConversations.userId, viewer.userId))
        .orderBy(desc(chatConversations.updatedAt))
        .limit(limit);
      const ids = convos.map((c) => c.id);
      const aggBy = new Map<string, { tokensIn: number; tokensOut: number }>();
      if (ids.length) {
        const aggs = await db
          .select({
            conversationId: chatMessages.conversationId,
            tokensIn: sum(chatMessages.tokensIn),
            tokensOut: sum(chatMessages.tokensOut),
          })
          .from(chatMessages)
          .where(inArray(chatMessages.conversationId, ids))
          .groupBy(chatMessages.conversationId);
        for (const a of aggs)
          aggBy.set(a.conversationId, {
            tokensIn: Number(a.tokensIn ?? 0),
            tokensOut: Number(a.tokensOut ?? 0),
          });
      }
      return convos.map((c) => normalizeChatConversation(c, aggBy.get(c.id)));
    })(),

    // workflow_runs (per-user) + workflow name
    (async (): Promise<MonitoredRun[]> => {
      if (!want("workflow")) return [];
      const rows = await db
        .select({
          id: workflowRuns.id,
          userId: workflowRuns.userId,
          workflowName: workflows.name,
          status: workflowRuns.status,
          startedAt: workflowRuns.startedAt,
          finishedAt: workflowRuns.finishedAt,
          createdAt: workflowRuns.createdAt,
          tokensIn: workflowRuns.tokensIn,
          tokensOut: workflowRuns.tokensOut,
          costUsd: workflowRuns.costUsd,
        })
        .from(workflowRuns)
        .leftJoin(workflows, eq(workflowRuns.workflowId, workflows.id))
        .where(eq(workflowRuns.userId, viewer.userId))
        .orderBy(desc(workflowRuns.createdAt))
        .limit(limit);
      return rows.map((r) => normalizeWorkflowRun(r as never));
    })(),
  ]);

  const out = [...agentRuns, ...chatRuns, ...workflowRunsOut];
  return mergeAndSort(
    out.filter((r) => isVisible(r, viewer)),
    limit,
  );
}
