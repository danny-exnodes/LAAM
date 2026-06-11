import { auth } from "@/auth";
import { db } from "@/db";
import { workflows } from "@/db/schema";
import { getTemplate } from "@/lib/workflow/templates";
import { assertRunnable } from "@/lib/workflow/validate";
import { requireMutator } from "@/lib/auth/rbac";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  // viewer is read-only — instantiating a template inserts a new workflow row. Gate first.
  const gate = requireMutator(session);
  if (gate instanceof Response) return gate;

  const { id } = await params;
  const template = getTemplate(id);
  if (!template) return new Response(JSON.stringify({ error: "Template không tồn tại" }), { status: 404 });

  // Defensive: catalog test guarantees validity, but guard anyway
  try {
    assertRunnable(template.graph);
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "graph không hợp lệ" }),
      { status: 400 },
    );
  }

  const newId = crypto.randomUUID();
  await db.insert(workflows).values({
    id: newId,
    userId: session.user.id,
    name: template.name,
    description: template.description,
    graph: structuredClone(template.graph),
    isTemplate: false,
    status: "draft",
  });

  return new Response(JSON.stringify({ id: newId }), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
