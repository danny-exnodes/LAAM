import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { workflowSchedules } from "@/db/schema";
import { parseCron, nextRunAt as cronNext } from "@/lib/workflow/cron";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const { id } = await params;
  const rows = await db.select().from(workflowSchedules).where(eq(workflowSchedules.id, id)).limit(1);
  const sched = rows[0];
  if (!sched || sched.userId !== session.user.id)
    return new Response(JSON.stringify({ error: "Schedule không tồn tại" }), { status: 404 });

  await db.delete(workflowSchedules).where(eq(workflowSchedules.id, id));
  return new Response(null, { status: 204 });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const { id } = await params;
  const rows = await db.select().from(workflowSchedules).where(eq(workflowSchedules.id, id)).limit(1);
  const sched = rows[0];
  if (!sched || sched.userId !== session.user.id)
    return new Response(JSON.stringify({ error: "Schedule không tồn tại" }), { status: 404 });

  const body = ((await req.json().catch(() => null)) ?? {}) as {
    enabled?: boolean;
    cron?: string;
  };

  // Guard: at least one field must be provided
  if (body.enabled === undefined && body.cron === undefined)
    return new Response(
      JSON.stringify({ error: "Không có trường nào để cập nhật" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );

  const patch: Record<string, unknown> = { updatedAt: new Date() };

  if (body.enabled !== undefined) patch.enabled = body.enabled;

  if (body.cron !== undefined) {
    try {
      parseCron(body.cron);
    } catch (e) {
      return new Response(
        JSON.stringify({ error: e instanceof Error ? e.message : "cron không hợp lệ" }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }
    let nextRun: Date;
    try {
      nextRun = cronNext(body.cron, new Date());
    } catch (e) {
      return new Response(
        JSON.stringify({ error: e instanceof Error ? e.message : "cron không tính được mốc kế" }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }
    patch.cron = body.cron;
    patch.nextRunAt = nextRun;
  }

  await db.update(workflowSchedules).set(patch).where(eq(workflowSchedules.id, id));

  const updated = await db.select().from(workflowSchedules).where(eq(workflowSchedules.id, id)).limit(1);
  return new Response(JSON.stringify(updated[0]), {
    headers: { "content-type": "application/json" },
  });
}
