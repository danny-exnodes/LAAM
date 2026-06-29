import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { workflows } from "@/db/schema";
import { requireMutator } from "@/lib/auth/rbac";

// POST /api/workflows/[id]/save-as-template — snapshot a workflow's current graph
// into a NEW template-flagged workflow (mirrors the clone route; the isTemplate
// column already exists, so this is zero-migration). The template is owned by the
// caller and starts in "draft" so it doesn't auto-run.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  // viewer is read-only — this inserts a new workflow row. Gate before DB write.
  const gate = requireMutator(session);
  if (gate instanceof Response) return gate;

  const { id } = await params;

  const rows = await db.select().from(workflows).where(eq(workflows.id, id)).limit(1);
  const wf = rows[0];
  if (!wf) return new Response(JSON.stringify({ error: "Workflow không tồn tại" }), { status: 404 });

  // Only the owner (or an existing template) may be templated — same visibility
  // rule as clone, so a user can't snapshot someone else's private workflow.
  if (wf.userId !== session.user.id && !wf.isTemplate) {
    return new Response(JSON.stringify({ error: "Workflow không tồn tại" }), { status: 404 });
  }

  const newId = crypto.randomUUID();
  await db.insert(workflows).values({
    id: newId,
    userId: session.user.id,
    name: `${wf.name} (mẫu)`,
    description: wf.description ?? undefined,
    graph: structuredClone(wf.graph),
    isTemplate: true,
    status: "draft",
  });

  return new Response(JSON.stringify({ id: newId }), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
