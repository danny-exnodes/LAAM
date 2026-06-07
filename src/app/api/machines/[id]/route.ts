import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { machines, accessTokens } from "@/db/schema";

// DELETE /api/machines/:id — REVOKE the machine's collector token (keeps the
// machine + its sessions; the collector can no longer push). Owner/admin only.
//
// Dual-revoke (P0 Access spine, A1): after backfill a machine carries BOTH a
// legacy machines.tokenHash AND an access_token of the same hash, and the ingest
// resolver tries access_token first then falls back to machines.tokenHash. So we
// MUST close BOTH paths, or revocation is a no-op via the surviving one.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = session.user.role;
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json({ error: "Cần quyền owner/admin" }, { status: 403 });
  }
  const { id } = await params;
  // 1) legacy path
  await db.update(machines).set({ tokenHash: null }).where(eq(machines.id, id));
  // 2) unified access_token path
  await db
    .update(accessTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(accessTokens.machineId, id), isNull(accessTokens.revokedAt)));
  return NextResponse.json({ ok: true });
}
