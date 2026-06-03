// GET /api/events — Server-Sent Events stream of the live session list.
//
// Port of the v1 /api/events handler (bin/laam.js): on connect we push an
// initial `sessions` snapshot, then re-push whenever something publishes on
// the in-process events-bus (wired in a later Wave), plus a `:keepalive`
// comment every 25s so proxies don't drop the idle connection. The stream is
// torn down (timer cleared, bus unsubscribed) when the client cancels.

import { desc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { agentSessions } from "@/db/schema";
import { subscribe } from "@/lib/events-bus";

export const dynamic = "force-dynamic";

const KEEPALIVE_MS = 25_000;

// Serialize a DB row into the JSON-friendly LiveSession shape the client hook
// consumes (Dates → epoch ms so `isStuck` can compare numbers directly).
async function snapshot() {
  const rows = await db
    .select()
    .from(agentSessions)
    .orderBy(desc(agentSessions.lastActivity));
  return rows.map((s) => ({
    id: s.id,
    projectId: s.projectId,
    source: s.source,
    model: s.model,
    gitBranch: s.gitBranch,
    status: s.status ?? "done",
    startedAt: s.startedAt ? s.startedAt.getTime() : null,
    lastActivity: s.lastActivity ? s.lastActivity.getTime() : null,
    messageCount: s.messageCount,
    toolCount: s.toolCount,
    subAgentCount: s.subAgentCount,
    costUsd: s.costUsd,
    latestActivity: s.latestActivity,
    tokensIn: s.tokensIn,
    tokensOut: s.tokensOut,
  }));
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

      // Re-push on every bus event. We refetch the snapshot rather than trust
      // the event payload so all clients converge on the DB ground-truth.
      const unsubscribe = subscribe(() => {
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
