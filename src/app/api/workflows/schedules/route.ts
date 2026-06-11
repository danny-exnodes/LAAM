import { eq, and, desc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { workflows, workflowSchedules } from "@/db/schema";
import { parseCron, nextRunAt as cronNext } from "@/lib/workflow/cron";
import { requireMutator } from "@/lib/auth/rbac";

// POST /api/workflows/schedules (session) — tạo schedule cho 1 workflow user sở hữu.
// Validate cron (parseCron); nextRunAt = mốc cron đầu tiên sau now.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  // viewer is read-only — a schedule fires AUTONOMOUS connector writes on every tick,
  // bypassing the gated /run endpoint. Gate before any DB write.
  const gate = requireMutator(session);
  if (gate instanceof Response) return gate;
  const body = ((await req.json().catch(() => null)) ?? {}) as {
    workflowId?: string;
    cron?: string;
    timezone?: string;
    catchupPolicy?: string;
  };
  if (!body.workflowId || !body.cron) {
    return new Response(JSON.stringify({ error: "workflowId + cron bắt buộc" }), { status: 400 });
  }
  // Validate cron trước khi đụng DB.
  try {
    parseCron(body.cron);
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "cron không hợp lệ" }), { status: 400 });
  }
  // Ownership: workflow phải thuộc user.
  const rows = await db.select().from(workflows).where(eq(workflows.id, body.workflowId)).limit(1);
  const wf = rows[0];
  if (!wf || wf.userId !== session.user.id) {
    return new Response(JSON.stringify({ error: "không tìm thấy workflow" }), { status: 404 });
  }

  const id = crypto.randomUUID();
  // cron hợp-lệ-cú-pháp nhưng KHÔNG tính được mốc kế trong 366 ngày (vd "0 0 29 2 *")
  // → cronNext ném. Bắt → 400 (lỗi đầu vào của user), KHÔNG để rơi xuống 500.
  let next: Date;
  try {
    next = cronNext(body.cron, new Date());
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "cron không tính được mốc kế" }), { status: 400 });
  }
  await db.insert(workflowSchedules).values({
    id,
    workflowId: body.workflowId,
    userId: session.user.id,
    cron: body.cron,
    ...(body.timezone ? { timezone: body.timezone } : {}),
    ...(body.catchupPolicy ? { catchupPolicy: body.catchupPolicy } : {}),
    nextRunAt: next,
  });
  return new Response(JSON.stringify({ id, nextRunAt: next }), { status: 201, headers: { "content-type": "application/json" } });
}

// GET /api/workflows/schedules (session) — liệt kê schedule của user (mới nhất trước).
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  const rows = await db
    .select()
    .from(workflowSchedules)
    .where(and(eq(workflowSchedules.userId, session.user.id)))
    .orderBy(desc(workflowSchedules.createdAt));
  return new Response(JSON.stringify(rows), { headers: { "content-type": "application/json" } });
}
