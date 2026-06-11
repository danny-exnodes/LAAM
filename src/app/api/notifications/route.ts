import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listForUser, unreadCount } from "@/lib/notifications";

// GET /api/notifications — the caller's OWN notifications + unread count for the
// bell. Always scoped to session.user.id (a user can never read another's). Query:
//   ?unread=1 → only unread; ?limit=N → cap (default in the lib).
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get("unread") === "1";
  const limitRaw = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : undefined;

  const [items, unread] = await Promise.all([
    listForUser(userId, { unreadOnly, limit }),
    unreadCount(userId),
  ]);
  return NextResponse.json({ notifications: items, unread });
}
