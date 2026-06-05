import { auth } from "@/auth";
import { db } from "@/db";
import { publish } from "@/lib/events-bus";
import { executeRun } from "@/lib/workflow/run";
import { buildRunNode } from "@/lib/workflow/runtime";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  const { id } = await params;
  const result = await executeRun({ workflowId: id, userId: session.user.id, trigger: "manual" }, { db, publish, buildRunNode });
  if (!result.ok) return new Response(JSON.stringify({ error: result.error }), { status: result.status });
  return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
}
