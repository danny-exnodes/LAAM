import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { machines } from "@/db/schema";
import { verifyAccessToken, hashToken } from "@/lib/access-token";
import { upsertSessions, type ParsedProject, type ParsedSession } from "@/lib/sync";

// POST /api/ingest — remote collector pushes parsed sessions.
// Auth: `Authorization: Bearer <collector-token>` (NOT a user session).
//
// Forward-compat resolver (P0 Access spine): a collector token resolves via the
// unified `access_token` table first; if that misses we fall back to the legacy
// `machines.tokenHash` so un-migrated collectors keep working until that column
// is dropped in a later phase. Either path writes ORG-SHARED monitoring rows —
// the token's userId is provenance only, not a data-isolation key (Q2).
export async function POST(req: Request) {
  const authz = req.headers.get("authorization") ?? "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
  if (!token) {
    return NextResponse.json({ error: "Missing collector token" }, { status: 401 });
  }

  // 1) unified access_token (kind=collector) → its linked machine.
  const tok = await verifyAccessToken(token, { kind: "collector" });
  let machine;
  if (tok?.machineId) {
    machine = (
      await db.select().from(machines).where(eq(machines.id, tok.machineId)).limit(1)
    )[0];
  } else {
    // 2) fallback: legacy machines.tokenHash.
    machine = (
      await db
        .select()
        .from(machines)
        .where(eq(machines.tokenHash, hashToken(token)))
        .limit(1)
    )[0];
  }
  if (!machine) {
    return NextResponse.json({ error: "Invalid collector token" }, { status: 401 });
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
