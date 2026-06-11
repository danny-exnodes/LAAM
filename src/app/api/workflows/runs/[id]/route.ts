import { and, asc, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { workflowRuns, workflowRunSteps } from "@/db/schema";
import { publish } from "@/lib/events-bus";

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

// PATCH /api/workflows/runs/[id] (session) — { action: "cancel" }: hủy run đang sống
// (queued | running | resumable). 'resumable' = crash chờ tick-resume; hủy TRƯỚC khi
// tickResume claim (chỉ claim status='resumable') → run thành 'cancelled' sẽ không hồi sinh.
// Ownership như GET (404 — không lộ run người khác). Run đã kết thúc → 409. Engine re-read
// status TRƯỚC mỗi node (run.ts shouldStop) → dừng gọn, step đã xong giữ nguyên.
const CANCELLABLE = ["queued", "running", "resumable"] as const;
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  const { id } = await params;

  const rows = await db.select().from(workflowRuns).where(eq(workflowRuns.id, id)).limit(1);
  const run = rows[0];
  if (!run || run.userId !== session.user.id) {
    return new Response(JSON.stringify({ error: "không tìm thấy run" }), { status: 404 });
  }

  const body = ((await req.json().catch(() => null)) ?? {}) as { action?: unknown };
  if (body.action !== "cancel") {
    return new Response(JSON.stringify({ error: "action không hợp lệ (chỉ hỗ trợ 'cancel')" }), { status: 400 });
  }
  if (!CANCELLABLE.includes(run.status as (typeof CANCELLABLE)[number])) {
    return new Response(JSON.stringify({ error: `run đã kết thúc (${run.status}) — không thể hủy` }), { status: 409 });
  }

  // Guard đua: chỉ flip khi CÒN sống (run có thể vừa finalize/được claim giữa select↔update).
  await db
    .update(workflowRuns)
    .set({ status: "cancelled", finishedAt: new Date() })
    .where(and(eq(workflowRuns.id, id), inArray(workflowRuns.status, [...CANCELLABLE])));

  const after = await db.select().from(workflowRuns).where(eq(workflowRuns.id, id)).limit(1);
  const updated = after[0];
  if (!updated || updated.status !== "cancelled") {
    return new Response(
      JSON.stringify({ error: `run đã kết thúc (${updated?.status ?? "?"}) — không thể hủy` }),
      { status: 409 },
    );
  }
  publish({ type: "workflow_run", runId: id, status: "cancelled" });
  return new Response(JSON.stringify({ run: updated }), { headers: { "content-type": "application/json" } });
}
