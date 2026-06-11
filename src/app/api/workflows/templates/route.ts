import { auth } from "@/auth";
import { db } from "@/db";
import { workflows } from "@/db/schema";
import { TEMPLATES } from "@/lib/workflow/templates";
import { assertRunnable } from "@/lib/workflow/validate";
import { requireMutator } from "@/lib/auth/rbac";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const list = TEMPLATES.map(({ id, name, description, moatLeaning }) => ({
    id,
    name,
    description,
    moatLeaning,
  }));

  return new Response(JSON.stringify(list), { headers: { "content-type": "application/json" } });
}

// POST /api/workflows/templates — instantiate a template as a new workflow for the user.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  // viewer is read-only — instantiating a template inserts a new workflow row. Gate first.
  const gate = requireMutator(session);
  if (gate instanceof Response) return gate;
  const body = ((await req.json().catch(() => null)) ?? {}) as { templateId?: string };
  if (!body.templateId) {
    return new Response(JSON.stringify({ error: "templateId bắt buộc" }), { status: 400 });
  }
  const tpl = TEMPLATES.find((t) => t.id === body.templateId);
  if (!tpl) {
    return new Response(JSON.stringify({ error: "template không tồn tại" }), { status: 404 });
  }
  try {
    assertRunnable(tpl.graph);
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "graph template không hợp lệ" }),
      { status: 400 },
    );
  }
  const id = crypto.randomUUID();
  await db.insert(workflows).values({
    id,
    userId: session.user.id,
    name: tpl.name,
    description: tpl.description,
    graph: tpl.graph,
    status: "active",
  });
  return new Response(JSON.stringify({ id }), { status: 201, headers: { "content-type": "application/json" } });
}
