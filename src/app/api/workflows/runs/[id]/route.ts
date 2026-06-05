import { eq, asc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { workflowRuns, workflowRunSteps } from "@/db/schema";

// GET /api/workflows/runs/[id] (session) — chi tiết 1 run + các step (theo seq).
// Ownership: run phải thuộc user (404 nếu không) → KHÔNG lộ run người khác.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  const { id } = await params;

  const rows = await db.select().from(workflowRuns).where(eq(workflowRuns.id, id)).limit(1);
  const run = rows[0];
  if (!run || run.userId !== session.user.id) {
    return new Response(JSON.stringify({ error: "không tìm thấy run" }), { status: 404 });
  }

  const steps = await db
    .select()
    .from(workflowRunSteps)
    .where(eq(workflowRunSteps.runId, id))
    .orderBy(asc(workflowRunSteps.seq));
  return new Response(JSON.stringify({ run, steps }), { headers: { "content-type": "application/json" } });
}
