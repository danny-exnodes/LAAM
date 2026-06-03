import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { machines } from "@/db/schema";
import { generateMachineToken, hashToken } from "@/lib/machine-token";

// GET /api/machines — list machines (no token hashes). Any logged-in user.
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
      hasToken: machines.tokenHash,
    })
    .from(machines)
    .orderBy(desc(machines.lastSeen));
  return NextResponse.json({
    machines: rows.map((m) => ({ ...m, hasToken: !!m.hasToken })),
  });
}

// POST /api/machines — create a machine + issue a token (owner/admin only).
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

  const token = generateMachineToken();
  const id = `m:${crypto.randomUUID()}`;
  await db.insert(machines).values({
    id,
    name: parsed.data.name,
    ownerUserId: session.user.id,
    tokenHash: hashToken(token),
  });

  // token shown once
  return NextResponse.json({ ok: true, id, name: parsed.data.name, token });
}
