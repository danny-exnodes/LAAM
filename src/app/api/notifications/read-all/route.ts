import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { markRead } from "@/lib/notifications";

// POST /api/notifications/read-all — mark ALL of the caller's notifications read.
// Scoped to session.user.id (markRead(userId, 'all') only touches the caller's
// unread rows). Personal read-state change → allowed for any authenticated user.
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await markRead(session.user.id, "all");
  return NextResponse.json({ ok: true });
}
