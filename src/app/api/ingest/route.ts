import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { machines } from "@/db/schema";
import { hashToken } from "@/lib/machine-token";
import { upsertSessions, type ParsedProject, type ParsedSession } from "@/lib/sync";

// POST /api/ingest — remote collector pushes parsed sessions.
// Auth: `Authorization: Bearer <machine-token>` (NOT a user session).
export async function POST(req: Request) {
  const authz = req.headers.get("authorization") ?? "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
  if (!token) {
    return NextResponse.json({ error: "Missing machine token" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(machines)
    .where(eq(machines.tokenHash, hashToken(token)))
    .limit(1);
  const machine = rows[0];
  if (!machine) {
    return NextResponse.json({ error: "Invalid machine token" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    projects?: ParsedProject[];
    sessions?: ParsedSession[];
  } | null;
  if (!body || !Array.isArray(body.sessions)) {
    return NextResponse.json({ error: "Body must be { projects, sessions }" }, { status: 400 });
  }

  // Remote transcripts live on the collector's machine — don't claim a local
  // path the server can't read.
  const sessions = body.sessions.map((s) => ({ ...s, file: null }));

  const res = await upsertSessions(machine.id, body.projects ?? [], sessions);
  await db
    .update(machines)
    .set({ lastSeen: new Date() })
    .where(eq(machines.id, machine.id));

  return NextResponse.json({ ok: true, machine: machine.name, ...res });
}
