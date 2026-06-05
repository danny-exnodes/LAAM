import { eq, and, desc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { workflowRuns } from "@/db/schema";

// GET /api/workflows/runs (session) — observability cho Phase E. Liệt kê run của
// user (?workflowId, ?status), mới nhất trước. Lọc theo userId → chỉ run của mình.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  const url = new URL(req.url);
  const workflowId = url.searchParams.get("workflowId");
  const status = url.searchParams.get("status");

  const conds = [eq(workflowRuns.userId, session.user.id)];
  if (workflowId) conds.push(eq(workflowRuns.workflowId, workflowId));
  if (status) conds.push(eq(workflowRuns.status, status));

  const rows = await db
    .select()
    .from(workflowRuns)
    .where(and(...conds))
    .orderBy(desc(workflowRuns.createdAt))
    .limit(100);
  return new Response(JSON.stringify(rows), { headers: { "content-type": "application/json" } });
}
