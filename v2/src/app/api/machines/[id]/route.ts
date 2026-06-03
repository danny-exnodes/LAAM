import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { machines } from "@/db/schema";

// DELETE /api/machines/:id — REVOKE the machine token (keeps the machine + its
// sessions; the collector can no longer push). Owner/admin only.
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
  await db.update(machines).set({ tokenHash: null }).where(eq(machines.id, id));
  return NextResponse.json({ ok: true });
}
