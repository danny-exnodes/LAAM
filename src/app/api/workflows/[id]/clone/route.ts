import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { workflows } from "@/db/schema";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const { id } = await params;

  const rows = await db
    .select()
    .from(workflows)
    .where(eq(workflows.id, id))
    .limit(1);

  const wf = rows[0];
  if (!wf) return new Response(JSON.stringify({ error: "Workflow không tồn tại" }), { status: 404 });

  // Allow clone if caller owns it OR it is a template-flagged workflow
  if (wf.userId !== session.user.id && !wf.isTemplate) {
    return new Response(JSON.stringify({ error: "Workflow không tồn tại" }), { status: 404 });
  }

  const newId = crypto.randomUUID();
  await db.insert(workflows).values({
    id: newId,
    userId: session.user.id,
    name: `${wf.name} (bản sao)`,
    description: wf.description ?? undefined,
    graph: structuredClone(wf.graph),
    isTemplate: false,
    status: "draft",
  });

  return new Response(JSON.stringify({ id: newId }), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
