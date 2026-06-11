import { NextResponse } from "next/server";
import { eq, desc, asc, and, or, ilike, exists } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { chatConversations, chatMessages } from "@/db/schema";
import { retitleFromMessage } from "@/lib/chat/title";
import { requireMutator } from "@/lib/auth/rbac";

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

// First user message of a conversation (for re-deriving its title).
async function firstUserMessage(convId: string): Promise<string | null> {
  const rows = await db
    .select({ content: chatMessages.content })
    .from(chatMessages)
    .where(and(eq(chatMessages.conversationId, convId), eq(chatMessages.role, "user")))
    .orderBy(asc(chatMessages.createdAt))
    .limit(1);
  return rows[0]?.content ?? null;
}

// POST /api/conversations — title maintenance (owner-scoped, non-destructive):
//   { action: "backfill-titles" } — S1: re-derive every conversation whose title
//     leaked attachment bytes ("--- Tệp:|URL:") from its stored first user message.
//   { action: "retitle", id }     — S9: re-derive ONE conversation's title.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // viewer is read-only — retitle/backfill-titles UPDATE conversation rows. Gate before DB write.
  const gate = requireMutator(session);
  if (gate instanceof Response) return gate;
  const userId = session.user.id;
  const body = (await req.json().catch(() => null)) as { action?: string; id?: string } | null;

  if (body?.action === "retitle" && typeof body.id === "string") {
    const rows = await db
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.id, body.id))
      .limit(1);
    const conv = rows[0];
    if (!conv || conv.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Prefer the first user message; if it's gone (messages deleted), clean the
    // title string itself — retitleFromMessage extracts the filename from it.
    const source = (await firstUserMessage(body.id)) ?? conv.title ?? "";
    const next = retitleFromMessage(source);
    if (next && next !== conv.title) {
      await db.update(chatConversations).set({ title: next }).where(eq(chatConversations.id, body.id));
    }
    return NextResponse.json({ title: next ?? conv.title });
  }

  if (body?.action === "backfill-titles") {
    const convs = await db
      .select({ id: chatConversations.id, title: chatConversations.title })
      .from(chatConversations)
      .where(eq(chatConversations.userId, userId));
    let retitled = 0;
    for (const c of convs) {
      if (!c.title || !c.title.startsWith("--- ")) continue; // only fix polluted titles
      // Prefer the first user message; fall back to the title itself when the
      // conversation has no messages (deleted) so it still gets cleaned.
      const source = (await firstUserMessage(c.id)) ?? c.title;
      const next = retitleFromMessage(source);
      if (next && next !== c.title) {
        await db.update(chatConversations).set({ title: next }).where(eq(chatConversations.id, c.id));
        retitled++;
      }
    }
    return NextResponse.json({ scanned: convs.length, retitled });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
