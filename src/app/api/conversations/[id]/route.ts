import { NextResponse } from "next/server";
import { eq, asc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { chatConversations, chatMessages } from "@/db/schema";
import { requireMutator } from "@/lib/auth/rbac";

async function ownedConversation(id: string, userId: string) {
  const rows = await db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.id, id))
    .limit(1);
  const c = rows[0];
  return c && c.userId === userId ? c : null;
}

// GET /api/conversations/:id — messages of one conversation (owner only).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const conv = await ownedConversation(id, session.user.id);
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const messages = await db
    .select({
      id: chatMessages.id,
      role: chatMessages.role,
      content: chatMessages.content,
      tokensIn: chatMessages.tokensIn,
      tokensOut: chatMessages.tokensOut,
      attachments: chatMessages.attachments,
    })
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, id))
    .orderBy(asc(chatMessages.createdAt));

  return NextResponse.json({ id: conv.id, title: conv.title, messages });
}

// PATCH /api/conversations/:id — rename a conversation (owner only).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const gate = requireMutator(session); // viewer is read-only
  if (gate instanceof Response) return gate;
  const { id } = await params;
  const conv = await ownedConversation(id, session.user.id);
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { title?: unknown } | null;
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 120) : "";
  if (!title) return NextResponse.json({ error: "Empty title" }, { status: 400 });

  await db
    .update(chatConversations)
    .set({ title })
    .where(eq(chatConversations.id, id));
  return NextResponse.json({ ok: true, title });
}

// DELETE /api/conversations/:id — delete a conversation (owner only).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const gate = requireMutator(session); // viewer is read-only
  if (gate instanceof Response) return gate;
  const { id } = await params;
  const conv = await ownedConversation(id, session.user.id);
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(chatConversations).where(eq(chatConversations.id, id));
  return NextResponse.json({ ok: true });
}
