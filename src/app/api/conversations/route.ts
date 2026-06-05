import { NextResponse } from "next/server";
import { eq, desc, and, or, ilike, exists } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { chatConversations, chatMessages } from "@/db/schema";

// GET /api/conversations — the current user's conversations (newest first).
// FEAT-1: ?q= filters by title OR message content (so a search finds a
// conversation by what was said in it, not just its title).
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const term = new URL(req.url).searchParams.get("q")?.trim();
  const mine = eq(chatConversations.userId, session.user.id);
  const where = term
    ? and(
        mine,
        or(
          ilike(chatConversations.title, `%${term}%`),
          exists(
            db
              .select({ x: chatMessages.id })
              .from(chatMessages)
              .where(
                and(
                  eq(chatMessages.conversationId, chatConversations.id),
                  ilike(chatMessages.content, `%${term}%`),
                ),
              ),
          ),
        ),
      )
    : mine;
  const rows = await db
    .select({
      id: chatConversations.id,
      title: chatConversations.title,
      updatedAt: chatConversations.updatedAt,
    })
    .from(chatConversations)
    .where(where)
    .orderBy(desc(chatConversations.updatedAt));

  return NextResponse.json({
    conversations: rows.map((r) => ({
      id: r.id,
      title: r.title,
      updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
    })),
  });
}
