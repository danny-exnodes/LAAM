import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { machines, accessTokens } from "@/db/schema";
import {
  generateAccessToken,
  formatTokenDisplay,
  hashToken,
  machinesWithActiveToken,
} from "@/lib/access-token";

// GET /api/machines — list machines (no token hashes). Any logged-in user.
// `hasToken` = a legacy machines.tokenHash OR a non-revoked collector
// access_token (the credential now lives in access_token; see P0 Access spine).
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rows = await db
    .select({
      id: machines.id,
      name: machines.name,
      hostname: machines.hostname,
      lastSeen: machines.lastSeen,
      createdAt: machines.createdAt,
      tokenHash: machines.tokenHash,
    })
    .from(machines)
    .orderBy(desc(machines.lastSeen));
  const active = await machinesWithActiveToken();
  return NextResponse.json({
    machines: rows.map(({ tokenHash, ...m }) => ({
      ...m,
      hasToken: !!tokenHash || active.has(m.id),
    })),
  });
}

// POST /api/machines — create a machine + issue a collector token (owner/admin
// only). The token lives in access_token (kind=collector), NOT machines.tokenHash.
// The raw token is returned ONCE and never stored in plaintext.
const createSchema = z.object({ name: z.string().min(1).max(120) });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = session.user.role;
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json({ error: "Cần quyền owner/admin" }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Tên không hợp lệ" }, { status: 400 });
  }

  const token = generateAccessToken();
  const { prefix, last4 } = formatTokenDisplay(token);
  const id = `m:${crypto.randomUUID()}`;

  await db.insert(machines).values({
    id,
    name: parsed.data.name,
    ownerUserId: session.user.id,
  });
  await db.insert(accessTokens).values({
    kind: "collector",
    machineId: id,
    userId: session.user.id, // provenance/audit, NOT an isolation key
    name: parsed.data.name,
    prefix,
    last4,
    tokenHash: hashToken(token),
    scopes: ["ingest"],
  });

  // token shown once
  return NextResponse.json({ ok: true, id, name: parsed.data.name, token, prefix, last4 });
}
