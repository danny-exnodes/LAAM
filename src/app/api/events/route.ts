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

async function snapshot(): Promise<LiveSession[]> {
  // Explicit column select so the projects leftJoin contributes only the
  // project name (no column-name clash with the session row).
  const rows = await db
    .select({
      id: agentSessions.id,
      projectId: agentSessions.projectId,
      projectName: projects.name,
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
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      const pushSessions = async () => {
        const sessions = await snapshot();
        send(`event: sessions\ndata: ${JSON.stringify({ type: "sessions", sessions })}\n\n`);
      };

      // Initial snapshot.
      await pushSessions();

      // Re-push sessions on every bus event (so all clients converge on DB
      // ground-truth). Additionally, workflow_run / workflow_run_step events
      // are forwarded as their own SSE event types so the UI can update
      // workflow status without polling.
      const unsubscribe = subscribe((evt: BusEvent) => {
        if (evt.type === "workflow_run_step" || evt.type === "workflow_run") {
          // Forward the raw event payload under its own SSE event name.
          send(`event: ${evt.type}\ndata: ${JSON.stringify(evt)}\n\n`);
        }
        void pushSessions();
      });

      const keepalive = setInterval(() => send(":keepalive\n\n"), KEEPALIVE_MS);

      cleanup = () => {
        closed = true;
        clearInterval(keepalive);
        unsubscribe();
      };
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
