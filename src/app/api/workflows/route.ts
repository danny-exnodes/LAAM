import { eq, desc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { workflows } from "@/db/schema";
import { assertLinear } from "@/lib/workflow/validate";
import type { WorkflowGraph } from "@/lib/workflow/types";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  const body = ((await req.json().catch(() => null)) ?? {}) as { name?: string; graph?: WorkflowGraph };
  if (!body.name || !body.graph) return new Response(JSON.stringify({ error: "name + graph bắt buộc" }), { status: 400 });
  try {
    assertLinear(body.graph); // A0: chỉ nhận graph tuyến tính (cổng §5.5)
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "graph không hợp lệ" }), { status: 400 });
  }
  const id = crypto.randomUUID();
  await db.insert(workflows).values({ id, userId: session.user.id, name: body.name, graph: body.graph, status: "active" });
  return new Response(JSON.stringify({ id }), { status: 201, headers: { "content-type": "application/json" } });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  const rows = await db.select().from(workflows).where(eq(workflows.userId, session.user.id)).orderBy(desc(workflows.createdAt));
  return new Response(JSON.stringify(rows), { headers: { "content-type": "application/json" } });
}
