import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { workflows } from "@/db/schema";
import { assertRunnable } from "@/lib/workflow/validate";
import { requireMutator } from "@/lib/auth/rbac";
import type { WorkflowGraph } from "@/lib/workflow/types";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const { id } = await params;

  const rows = await db.select().from(workflows).where(eq(workflows.id, id)).limit(1);
  const wf = rows[0];
  if (!wf || wf.userId !== session.user.id)
    return new Response(JSON.stringify({ error: "Workflow không tồn tại" }), { status: 404 });

  return new Response(JSON.stringify(wf), {
    headers: { "content-type": "application/json" },
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  const gate = requireMutator(session); // viewer is read-only
  if (gate instanceof Response) return gate;

  const { id } = await params;

  const rows = await db.select().from(workflows).where(eq(workflows.id, id)).limit(1);
  const wf = rows[0];
  if (!wf || wf.userId !== session.user.id)
    return new Response(JSON.stringify({ error: "Workflow không tồn tại" }), { status: 404 });

  const body = ((await req.json().catch(() => null)) ?? {}) as {
    name?: string;
    graph?: WorkflowGraph;
  };

  if (body.graph !== undefined) {
    try {
      assertRunnable(body.graph);
    } catch (e) {
      return new Response(
        JSON.stringify({ error: e instanceof Error ? e.message : "graph không hợp lệ" }),
        { status: 400 },
      );
    }
  }

  const patch: Partial<typeof wf> = { updatedAt: new Date() };
  if (body.name !== undefined) patch.name = body.name;
  if (body.graph !== undefined) patch.graph = body.graph;

  await db.update(workflows).set(patch).where(eq(workflows.id, id));

  const updated = await db.select().from(workflows).where(eq(workflows.id, id)).limit(1);
  return new Response(JSON.stringify(updated[0]), {
    headers: { "content-type": "application/json" },
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  const gate = requireMutator(session); // viewer is read-only
  if (gate instanceof Response) return gate;

  const { id } = await params;

  const rows = await db.select().from(workflows).where(eq(workflows.id, id)).limit(1);
  const wf = rows[0];
  if (!wf || wf.userId !== session.user.id)
    return new Response(JSON.stringify({ error: "Workflow không tồn tại" }), { status: 404 });

  // DB CASCADE: workflow_schedule, workflow_run, workflow_run_step are deleted automatically.
  await db.delete(workflows).where(eq(workflows.id, id));

  return new Response(null, { status: 204 });
}
