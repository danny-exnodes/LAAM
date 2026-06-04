import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { agentSessions } from "@/db/schema";
import { getTimeline } from "@/lib/monitoring/parser.js";
import { getLocalTimeline } from "@/lib/monitoring/localParser.js";

export const dynamic = "force-dynamic";

// GET /api/agents/:id/timeline — the message/tool log for one session, read from
// its transcript on demand. Powers the Agents drawer (the list is client-side,
// so it can't read the file itself). Auth-gated like the rest of monitoring.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const rows = await db
    .select({
      transcriptPath: agentSessions.transcriptPath,
      source: agentSessions.source,
    })
    .from(agentSessions)
    .where(eq(agentSessions.id, id))
    .limit(1);
  const s = rows[0];
  if (!s) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let timeline: unknown[] = [];
  if (s.transcriptPath) {
    try {
      timeline =
        s.source === "local"
          ? (getLocalTimeline(s.transcriptPath) as unknown[])
          : (getTimeline(s.transcriptPath) as unknown[]);
    } catch {
      /* file may have rotated/moved, or be on another machine — empty log */
    }
  }

  return NextResponse.json({ timeline });
}
