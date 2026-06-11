// GET /api/events — Server-Sent Events stream of the live session list.
//
// Port of the v1 /api/events handler (bin/laam.js): on connect we push an
// initial `sessions` snapshot, then re-push whenever something publishes on
// the in-process events-bus (wired in a later Wave), plus a `:keepalive`
// comment every 25s so proxies don't drop the idle connection. The stream is
// torn down (timer cleared, bus unsubscribed) when the client cancels.

import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { agentSessions, projects } from "@/db/schema";
import type { LiveSession } from "@/hooks/useLiveSessions";
import { subscribe } from "@/lib/events-bus";
import type { BusEvent } from "@/lib/events-bus";

export const dynamic = "force-dynamic";

const KEEPALIVE_MS = 25_000;

// A joined session row: the agent_session columns plus the project's name
// (null when the session has no project).
type SnapshotRow = {
  id: string;
  projectId: string | null;
  projectName: string | null;
  machineId: string | null;
  source: string;
  model: string | null;
  gitBranch: string | null;
  status: string | null;
  startedAt: Date | null;
  lastActivity: Date | null;
  messageCount: number;
  toolCount: number;
  subAgentCount: number;
  subAgents: LiveSession["subAgents"];
  costUsd: number;
  latestActivity: string | null;
  tokensIn: number;
  tokensOut: number;
};

// Serialize a joined DB row into the JSON-friendly LiveSession shape the client
// hook consumes (Dates → epoch ms so `isStuck` can compare numbers directly).
export function mapRowToLiveSession(s: SnapshotRow): LiveSession {
  return {
    id: s.id,
    projectId: s.projectId,
    projectName: s.projectName,
    machineId: s.machineId,
    source: s.source,
    model: s.model,
    gitBranch: s.gitBranch,
    status: s.status ?? "done",
    startedAt: s.startedAt ? s.startedAt.getTime() : null,
    lastActivity: s.lastActivity ? s.lastActivity.getTime() : null,
    messageCount: s.messageCount,
    toolCount: s.toolCount,
    subAgentCount: s.subAgentCount,
    subAgents: s.subAgents ?? null,
    costUsd: s.costUsd,
    latestActivity: s.latestActivity,
    tokensIn: s.tokensIn,
    tokensOut: s.tokensOut,
  };
}

// --- Shared client registry (perf M2) -------------------------------------
// One bus subscription + ONE DB snapshot per bus event, broadcast to every
// connected client — instead of one subscription and one full-table query per
// client per event. The bus is subscribed while at least one client is
// connected and released when the last one disconnects.

type SseClient = { send: (chunk: string) => void };
const clients = new Set<SseClient>();
let unsubscribeBus: (() => void) | null = null;

/** Number of connected SSE clients (tests / diagnostics). */
export function clientCount(): number {
  return clients.size;
}

function broadcast(chunk: string) {
  for (const c of [...clients]) c.send(chunk);
}

async function broadcastSessions() {
  const sessions = await snapshot();
  broadcast(sessionsChunk(sessions));
}

function onBusEvent(evt: BusEvent) {
  if (evt.type === "workflow_run_step" || evt.type === "workflow_run") {
    // Forward the raw event payload under its own SSE event name so the UI
    // can update workflow status without polling.
    broadcast(`event: ${evt.type}\ndata: ${JSON.stringify(evt)}\n\n`);
  }
  // Re-push sessions on every bus event (all clients converge on DB
  // ground-truth) — queried + stringified once, fanned out to everyone.
  // Catch the snapshot()/DB rejection here: an uncaught rejection from this
  // fire-and-forget call would crash the Node process (P2-3).
  void broadcastSessions().catch((e) => console.error("[events] snapshot failed", e));
}

function addClient(c: SseClient) {
  clients.add(c);
  if (!unsubscribeBus) unsubscribeBus = subscribe(onBusEvent);
}

function removeClient(c: SseClient) {
  clients.delete(c);
  if (clients.size === 0 && unsubscribeBus) {
    unsubscribeBus();
    unsubscribeBus = null;
  }
}

// ---------------------------------------------------------------------------

function sessionsChunk(sessions: LiveSession[]): string {
  return `event: sessions\ndata: ${JSON.stringify({ type: "sessions", sessions })}\n\n`;
}

async function snapshot(): Promise<LiveSession[]> {
  // Explicit column select so the projects leftJoin contributes only the
  // project name (no column-name clash with the session row).
  const rows = await db
    .select({
      id: agentSessions.id,
      projectId: agentSessions.projectId,
      projectName: projects.name,
      machineId: agentSessions.machineId,
      source: agentSessions.source,
      model: agentSessions.model,
      gitBranch: agentSessions.gitBranch,
      status: agentSessions.status,
      startedAt: agentSessions.startedAt,
      lastActivity: agentSessions.lastActivity,
      messageCount: agentSessions.messageCount,
      toolCount: agentSessions.toolCount,
      subAgentCount: agentSessions.subAgentCount,
      subAgents: agentSessions.subAgents,
      costUsd: agentSessions.costUsd,
      latestActivity: agentSessions.latestActivity,
      tokensIn: agentSessions.tokensIn,
      tokensOut: agentSessions.tokensOut,
    })
    .from(agentSessions)
    .leftJoin(projects, eq(agentSessions.projectId, projects.id))
    .orderBy(desc(agentSessions.lastActivity));
  return rows.map(mapRowToLiveSession);
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  const encoder = new TextEncoder();

  // Closure-scoped so both start() and cancel() reach the same teardown.
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let keepalive: ReturnType<typeof setInterval> | undefined;
      const client: SseClient = { send: (c) => send(c) };

      // Tear down ONCE: stop the keepalive and drop the client from the shared
      // registry (so the bus subscription + per-event DB snapshot are released
      // when the last client goes). Idempotent — both an enqueue failure and an
      // explicit cancel() route here.
      cleanup = () => {
        if (closed) return;
        closed = true;
        if (keepalive) clearInterval(keepalive);
        removeClient(client);
      };

      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // The client died (e.g. browser tab closed) mid-broadcast. Removing it
          // from the registry here is the ONLY teardown path for a client that
          // never triggers cancel() — without it the bus subscription + DB query
          // leak for every dead connection (P1-2).
          cleanup();
        }
      };

      // Initial snapshot — for THIS client only; bus-driven re-pushes are
      // queried once and broadcast via the shared registry above.
      send(sessionsChunk(await snapshot()));

      addClient(client);

      keepalive = setInterval(() => send(":keepalive\n\n"), KEEPALIVE_MS);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
