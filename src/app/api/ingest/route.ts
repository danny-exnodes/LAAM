import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { machines } from "@/db/schema";
import { verifyAccessToken, hashToken } from "@/lib/access-token";
import { upsertSessions, type ParsedProject, type ParsedSession } from "@/lib/sync";

// Size guard: reject oversized payloads before buffering/parsing the body.
// 5MB is generous — collectors push parsed session metadata, never transcripts.
const MAX_BODY_BYTES = 5 * 1024 * 1024;

// Read the request body to a string, aborting once the accumulated byte count
// exceeds MAX_BODY_BYTES. A content-length header is only an advisory hint a
// hostile/buggy collector can omit (e.g. chunked transfer) — so we enforce the
// cap on the actual bytes read, not the header. Returns null on a true read
// error so the caller treats it like the old `.catch(() => null)` 400 backstop;
// returns { tooLarge: true } once the cap is crossed so the caller can 413.
async function readBodyCapped(
  req: Request,
): Promise<{ tooLarge: true } | { tooLarge: false; text: string } | null> {
  if (!req.body) {
    // No stream (e.g. an empty body) — fall back to the buffered read; it is
    // already bounded by the absence of bytes.
    const text = await req.text().catch(() => null);
    return text == null ? null : { tooLarge: false, text };
  }
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        return { tooLarge: true };
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  return { tooLarge: false, text: new TextDecoder().decode(concat(chunks, total)) };
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

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

  // Reject oversized payloads BEFORE we buffer/parse the whole body. Enforced on
  // the bytes actually streamed (not the content-length header), so a chunked /
  // header-less request can't slip past the cap. 401-auth stays ahead of 413.
  const read = await readBodyCapped(req);
  if (read?.tooLarge) {
    return NextResponse.json({ error: "Payload too large (max 5MB)" }, { status: 413 });
  }

  let body: { projects?: ParsedProject[]; sessions?: ParsedSession[] } | null = null;
  if (read) {
    try {
      body = JSON.parse(read.text);
    } catch {
      body = null;
    }
  }
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
