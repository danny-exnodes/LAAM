// Scheduler: 2 pha tách rời (PIN-D1).
//
// tickClaim — bookkeeping THUẦN: với mỗi schedule due (enabled && nextRunAt<=now),
//   trong MỘT db.transaction: INSERT workflow_run{status:'queued', scheduleId,
//   scheduledFor} ON CONFLICT(scheduleId,scheduledFor) DO NOTHING  +  advance
//   nextRunAt/lastRunAt/missedCount. Cả hai cùng tx → KHÔNG có trạng thái "đã claim
//   nhưng chưa advance" (chống schedule kẹt vĩnh viễn). scheduledFor = nextRunAt ĐÃ
//   LƯU floored-đến-phút (KHÔNG now) → pokes đua tính cùng slot → unique dedupe.
//   Skip-realign: nextRunAt mới = mốc cron strictly > now (KHÔNG burst các run trễ);
//   fire-one mỗi tick; missedCount += max(0, skippedSlots-1).
//
// tickExecute — execution: nhặt run status='queued' (limit) → executeRunRow (flip
//   running → finalize). Tách khỏi claim → claim chết-giữa-chừng chỉ rollback tx,
//   execute chết-giữa-chừng để run kẹt 'running' (recover được, KHÔNG mất slot).
import { and, eq, lte, inArray } from "drizzle-orm";
import type { db as Db } from "@/db";
import { workflows, workflowSchedules, workflowRuns } from "@/db/schema";
import { nextRunAt as cronNext } from "./cron";
import { executeRunRow } from "./run";
import type { ExecuteRunDeps } from "./run";
import { resumeRunRow as resumeRunRowImpl } from "./resume";
import type { ResumeDeps } from "./resume";
import type { WorkflowGraph } from "./types";

// Floor 1 Date về ranh giới phút (bỏ giây + mili). nextRunAt đã lưu vốn trên ranh
// giới phút (cron sinh ra), floor lại để phòng thủ → slot ổn định cho dedupe.
function floorMinute(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), 0, 0);
}

const MAX_SKIP_COUNT = 10000; // cap đếm slot trễ (schedule treo rất lâu) → tick luôn nhanh; missedCount bão hoà

// Số slot cron trong [fromInclusive, now] (fromInclusive là slot due hiện tại → tính 1).
// Dùng cho missedCount (số slot bị bỏ = count-1, vì fire-one). Cap để né vòng lặp dài.
function countDueSlots(cron: string, fromInclusive: Date, now: Date): number {
  let count = 1; // chính slot due
  let cursor = fromInclusive;
  while (count < MAX_SKIP_COUNT) {
    const nxt = cronNext(cron, cursor);
    if (nxt > now) break;
    count++;
    cursor = nxt;
  }
  return count;
}

// Trả về danh sách run id ĐÃ claim (insert thành công, không bị dedupe).
export async function tickClaim(db: typeof Db, now: Date): Promise<string[]> {
  const due = await db
    .select()
    .from(workflowSchedules)
    .where(and(eq(workflowSchedules.enabled, true), lte(workflowSchedules.nextRunAt, now)));

  const claimed: string[] = [];
  for (const s of due) {
    if (!s.nextRunAt) continue; // nextRunAt null → chưa lên lịch, bỏ qua (an toàn)
    // BẢO VỆ TỪNG SCHEDULE: bất kỳ lỗi nào khi xử lý 1 schedule (cronNext ném khi
    // không có mốc trong 366 ngày — vd "0 0 29 2 *"; workflow-load fail; tx fail)
    // KHÔNG được (a) kẹt schedule đó (re-select mỗi tick → ném mãi), (b) làm chết
    // cả vòng lặp (siblings + tickExecute đói). → bắt lỗi, AUTO-DISABLE schedule
    // (update độc lập, NGOÀI tx claim) để nó không bị chọn lại, rồi `continue`.
    try {
      const scheduledFor = floorMinute(s.nextRunAt); // STORED nextRunAt, KHÔNG now (PIN)
      const next = cronNext(s.cron, now); // skip-realign: strictly > now, no burst
      const skipped = countDueSlots(s.cron, s.nextRunAt, now);

      // PIN-D1: insert (claim) + advance trong CÙNG tx. Process chết giữa chừng →
      // toàn bộ tx rollback → tick sau retry sạch (không kẹt vĩnh viễn).
      await db.transaction(async (tx) => {
        const wfRows = await tx.select().from(workflows).where(eq(workflows.id, s.workflowId)).limit(1);
        const wf = wfRows[0] as { id: string; userId: string; graph: WorkflowGraph } | undefined;
        if (!wf) return; // workflow đã xoá (FK cascade nên hiếm) → bỏ slot này

        const runId = crypto.randomUUID();
        const ins = await tx
          .insert(workflowRuns)
          .values({
            id: runId,
            workflowId: s.workflowId,
            userId: s.userId, // danh tính thực thi = chủ schedule (cred per-user)
            trigger: "schedule",
            status: "queued",
            graphSnapshot: wf.graph, // PIN-D4a: kế hoạch authored, tĩnh, đọc lúc claim
            scheduleId: s.id,
            scheduledFor,
          })
          .onConflictDoNothing({ target: [workflowRuns.scheduleId, workflowRuns.scheduledFor] })
          .returning({ id: workflowRuns.id });

        // Advance LUÔN trong tx này (kể cả dedupe): next suy từ (cron, now) → idempotent
        // dưới đua pokes (cùng now → cùng next) → schedule không bao giờ kẹt.
        await tx
          .update(workflowSchedules)
          .set({
            nextRunAt: next,
            lastRunAt: now,
            missedCount: s.missedCount + Math.max(0, skipped - 1),
            updatedAt: now,
          })
          .where(eq(workflowSchedules.id, s.id));

        if (ins.length > 0) claimed.push(runId); // chỉ tính khi thực sự insert (không dedupe)
      });
    } catch (err) {
      // KHÔNG rethrow: cô lập lỗi 1 schedule khỏi các siblings + tickExecute.
      console.error(`[workflow] schedule ${s.id} claim failed → auto-disable`, err);
      // Auto-disable (update nhỏ, độc lập — KHÔNG trong tx claim đã rollback): set
      // enabled=false để schedule này không còn bị tickClaim chọn → hết wedge. Bọc
      // try/catch riêng để lỗi DB ở đây cũng không thoát ra ngoài tickClaim.
      try {
        await db
          .update(workflowSchedules)
          .set({ enabled: false, updatedAt: now })
          .where(eq(workflowSchedules.id, s.id));
      } catch (disableErr) {
        console.error(`[workflow] schedule ${s.id} auto-disable also failed`, disableErr);
      }
      continue; // sang schedule kế → siblings + tickExecute vẫn chạy
    }
  }
  return claimed;
}

const MAX_EXECUTE_PER_TICK = 25; // bound công việc 1 tick (Rule: bound everything)

// Nhặt run queued + chạy. trigger luôn 'schedule' (run queued chỉ do tickClaim tạo).
// Trả về SỐ run đã execute (cho route báo {executed}).
export async function tickExecute(db: typeof Db, deps: ExecuteRunDeps): Promise<number> {
  const queued = await db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.status, "queued"))
    .limit(MAX_EXECUTE_PER_TICK);

  const rows = queued as { id: string; workflowId: string; userId: string; graphSnapshot: WorkflowGraph }[];
  for (const r of rows) {
    await executeRunRow(
      { id: r.id, workflowId: r.workflowId, userId: r.userId, trigger: "schedule", graphSnapshot: r.graphSnapshot },
      deps,
    );
  }
  return rows.length;
}

const MAX_RESUME_PER_TICK = 25;

// Resume orphaned runs (marked 'resumable' by the boot sweep). The claim is ATOMIC and
// BOUNDED inside the UPDATE — id IN (SELECT … LIMIT n FOR UPDATE SKIP LOCKED) — so two
// concurrent pokes can't double-claim one run AND runs beyond the cap are NOT stranded as
// 'running' (F2: flip-all-then-slice would orphan #26+). Resume each from its journal.
export async function tickResume(
  db: typeof Db,
  deps: Pick<ResumeDeps, "publish" | "buildRunNode" | "notify"> & { resumeRunRow?: typeof resumeRunRowImpl },
): Promise<number> {
  const resume = deps.resumeRunRow ?? resumeRunRowImpl;
  const sub = db
    .select({ id: workflowRuns.id })
    .from(workflowRuns)
    .where(eq(workflowRuns.status, "resumable"))
    .limit(MAX_RESUME_PER_TICK)
    .for("update", { skipLocked: true });
  const claimed = (await db
    .update(workflowRuns)
    .set({ status: "running" })
    .where(inArray(workflowRuns.id, sub))
    .returning({ id: workflowRuns.id })) as { id: string }[];
  for (const r of claimed) {
    await resume(r.id, { db, publish: deps.publish, buildRunNode: deps.buildRunNode, notify: deps.notify });
  }
  return claimed.length;
}
