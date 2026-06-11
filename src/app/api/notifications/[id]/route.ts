import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { markRead } from "@/lib/notifications";

// PATCH /api/notifications/:id — mark ONE notification read. Scoped to the caller:
// markRead(userId, id) only touches rows owned by userId, so this can never mark
// another user's notification read (no ownership leak, no need for a 403 path —
// a non-owned id simply matches zero rows). Not a "mutator-gated" route: marking
// your own notification read is a personal read-state change, allowed for any
// authenticated user incl. viewer (like dismissing your own toast).
export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  await markRead(session.user.id, id);
  return NextResponse.json({ ok: true });
}
