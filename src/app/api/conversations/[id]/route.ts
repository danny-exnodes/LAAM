import { NextResponse } from "next/server";
import { eq, asc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { chatConversations, chatMessages, chatToolCalls } from "@/db/schema";
import { deriveFromToolResult, worthShowing, viewKey, type ViewDescriptor } from "@/lib/agent/view";
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

  // Tables are rebuilt from the STORED tool results, not stored themselves: the rows are
  // already in chat_tool_call and deriveFromToolResult is pure, so replaying it costs nothing
  // to keep in sync and needs no migration.
  //
  // This is not cosmetic. Without it a reloaded conversation shows only the model's prose —
  // and once the model stops retyping rows (the whole point of trimming what it is sent), the
  // rows would exist in the database but nowhere the user can see. Measured on a real turn:
  // the model retyped 50 of 62 rows, got one store id wrong (PH-1 for PH-001, a value that
  // does not exist), and closed with "All 62 records were returned". The rebuilt table is
  // code-derived, so it cannot drift, and it carries the honest 50/62 note.
  const views = await viewsByMessage(id);

  return NextResponse.json({
    id: conv.id,
    title: conv.title,
    messages: messages.map((m) => (views.has(m.id) ? { ...m, views: views.get(m.id) } : m)),
  });
}

// Rebuild the panels of one conversation, keyed by the assistant message they belong to.
// Same size gate as the live path (worthShowing) so an incidental lookup does not come back
// as a table, and so the response stays bounded — the raw results of a busy conversation run
// to ~127kB, of which only the big tabular ones are worth returning.
async function viewsByMessage(conversationId: string): Promise<Map<string, ViewDescriptor[]>> {
  const out = new Map<string, ViewDescriptor[]>();
  let rows: Array<{ messageId: string | null; name: string; result: unknown; createdAt: Date }>;
  try {
    rows = await db
      .select({
        messageId: chatToolCalls.messageId,
        name: chatToolCalls.name,
        result: chatToolCalls.result,
        createdAt: chatToolCalls.createdAt,
      })
      .from(chatToolCalls)
      .where(eq(chatToolCalls.conversationId, conversationId))
      .orderBy(asc(chatToolCalls.seq));
  } catch {
    return out; // rebuilding panels must never fail loading the conversation itself
  }

  // Drop repeats with the SAME rule the live path uses (view.ts viewKey). A conversation that
  // ran one query several times stored one result per run, and rebuilding them all stacked
  // identical tables under one message.
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.messageId || !worthShowing(r.result)) continue;
    const d = deriveFromToolResult(r.name, r.result, r.createdAt.getTime());
    if (!d) continue;
    const k = r.messageId + "|" + viewKey(d);
    if (seen.has(k)) continue;
    seen.add(k);
    out.set(r.messageId, [...(out.get(r.messageId) ?? []), d]);
  }
  return out;
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
