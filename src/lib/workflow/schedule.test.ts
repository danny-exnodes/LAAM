import { describe, expect, test, vi } from "vitest";
import { tickClaim, tickExecute } from "./schedule";

const local = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi, 0, 0);

// ── Mock helpers ──────────────────────────────────────────────────────────
// txMock ghi lại các op (insert/update) trong MỘT transaction callback. selectQueue
// trả lần lượt cho mỗi .select() (workflow load, …). insertReturns điều khiển kết quả
// onConflictDoNothing().returning() (──[] = conflict/dedupe).

type TxOps = { inserts: unknown[]; updates: unknown[] };

function makeTx(opts: { workflowRow?: unknown; insertReturns?: { id: string }[] }) {
  const ops: TxOps = { inserts: [], updates: [] };
  const tx = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => (opts.workflowRow ? [opts.workflowRow] : []) }) }) }),
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            // ghi op insert (giá trị đã set ở values — ta capture qua closure riêng dưới)
            return opts.insertReturns ?? [{ id: "auto" }];
          },
        }),
      }),
    }),
    update: () => ({ set: (v: unknown) => ({ where: async () => { ops.updates.push(v); } }) }),
  };
  return { tx, ops };
}

describe("tickClaim — atomic claim (PIN-D1) + skip-realign", () => {
  test("claim: INSERT queued run + UPDATE advance nextRunAt trong CÙNG MỘT transaction", async () => {
    // Ghi nhận: cả insert lẫn update phải xảy ra TRONG một lần gọi transaction(fn).
    let txCallbacks = 0;
    let insideTxInserts = 0;
    let insideTxUpdates = 0;
    const sched = {
      id: "s1", workflowId: "w1", userId: "u1", cron: "*/5 * * * *",
      nextRunAt: local(2026, 6, 5, 12, 5), missedCount: 0, enabled: true,
    };
    const wf = { id: "w1", userId: "u1", graph: { nodes: [], edges: [] } };
    const db = {
      // select schedules due (ngoài tx)
      select: () => ({ from: () => ({ where: async () => [sched] }) }),
      transaction: async (fn: (tx: unknown) => Promise<void>) => {
        txCallbacks++;
        const tx = {
          select: () => ({ from: () => ({ where: () => ({ limit: async () => [wf] }) }) }),
          insert: () => ({
            values: () => ({
              onConflictDoNothing: () => ({ returning: async () => { insideTxInserts++; return [{ id: "r1" }]; } }),
            }),
          }),
          update: () => ({ set: () => ({ where: async () => { insideTxUpdates++; } }) }),
        };
        await fn(tx);
      },
    };
    const claimed = await tickClaim(db as never, local(2026, 6, 5, 12, 6));
    expect(txCallbacks).toBe(1); // 1 schedule due → 1 transaction
    expect(insideTxInserts).toBe(1); // INSERT trong tx
    expect(insideTxUpdates).toBe(1); // UPDATE advance trong CÙNG tx
    expect(claimed).toHaveLength(1); // 1 run claimed
  });

  test("scheduledFor = floor(nextRunAt ĐÃ LƯU đến phút), KHÔNG phải now", async () => {
    let capturedScheduledFor: Date | undefined;
    const sched = {
      id: "s1", workflowId: "w1", userId: "u1", cron: "*/5 * * * *",
      nextRunAt: local(2026, 6, 5, 12, 5), missedCount: 0, enabled: true,
    };
    const wf = { id: "w1", userId: "u1", graph: { nodes: [], edges: [] } };
    const db = {
      select: () => ({ from: () => ({ where: async () => [sched] }) }),
      transaction: async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          select: () => ({ from: () => ({ where: () => ({ limit: async () => [wf] }) }) }),
          insert: () => ({
            values: (v: { scheduledFor?: Date }) => {
              capturedScheduledFor = v.scheduledFor;
              return { onConflictDoNothing: () => ({ returning: async () => [{ id: "r1" }] }) };
            },
          }),
          update: () => ({ set: () => ({ where: async () => {} }) }),
        };
        await fn(tx);
      },
    };
    // now = 12:09:30 — KHÁC nextRunAt. scheduledFor phải = 12:05 (nextRunAt floored), KHÔNG = 12:09.
    await tickClaim(db as never, new Date(2026, 5, 5, 12, 9, 30, 0));
    expect(capturedScheduledFor).toEqual(local(2026, 6, 5, 12, 5));
  });

  test("trigger='schedule' + status='queued' + scheduleId set khi insert run", async () => {
    let captured: { trigger?: string; status?: string; scheduleId?: string; userId?: string } | undefined;
    const sched = { id: "s1", workflowId: "w1", userId: "uX", cron: "0 8 * * *", nextRunAt: local(2026, 6, 5, 8, 0), missedCount: 0, enabled: true };
    const wf = { id: "w1", userId: "uX", graph: { nodes: [], edges: [] } };
    const db = {
      select: () => ({ from: () => ({ where: async () => [sched] }) }),
      transaction: async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          select: () => ({ from: () => ({ where: () => ({ limit: async () => [wf] }) }) }),
          insert: () => ({ values: (v: typeof captured) => { captured = v; return { onConflictDoNothing: () => ({ returning: async () => [{ id: "r1" }] }) }; } }),
          update: () => ({ set: () => ({ where: async () => {} }) }),
        };
        await fn(tx);
      },
    };
    await tickClaim(db as never, local(2026, 6, 5, 9, 0));
    expect(captured?.trigger).toBe("schedule");
    expect(captured?.status).toBe("queued");
    expect(captured?.scheduleId).toBe("s1");
    expect(captured?.userId).toBe("uX");
  });

  test("conflict cùng slot (onConflictDoNothing → [] ) → KHÔNG claim (no double)", async () => {
    const sched = { id: "s1", workflowId: "w1", userId: "u1", cron: "*/5 * * * *", nextRunAt: local(2026, 6, 5, 12, 5), missedCount: 0, enabled: true };
    const wf = { id: "w1", userId: "u1", graph: { nodes: [], edges: [] } };
    const db = {
      select: () => ({ from: () => ({ where: async () => [sched] }) }),
      transaction: async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          select: () => ({ from: () => ({ where: () => ({ limit: async () => [wf] }) }) }),
          insert: () => ({ values: () => ({ onConflictDoNothing: () => ({ returning: async () => [] }) }) }), // DEDUPE
          update: () => ({ set: () => ({ where: async () => {} }) }),
        };
        await fn(tx);
      },
    };
    const claimed = await tickClaim(db as never, local(2026, 6, 5, 12, 6));
    expect(claimed).toHaveLength(0); // slot đã có run → không claim thêm
  });

  test("skip-realign: nextRunAt mới strictly > now (không burst) + missedCount += skipped-1", async () => {
    let advance: { nextRunAt?: Date; lastRunAt?: Date; missedCount?: number } | undefined;
    // cron mỗi phút; nextRunAt kẹt ở 12:00; now=12:04 → slots due = 12:00,12:01,12:02,12:03,12:04 (5),
    // fire 1, missed = 4. nextRunAt mới = 12:05 (strictly > now).
    const sched = { id: "s1", workflowId: "w1", userId: "u1", cron: "* * * * *", nextRunAt: local(2026, 6, 5, 12, 0), missedCount: 2, enabled: true };
    const wf = { id: "w1", userId: "u1", graph: { nodes: [], edges: [] } };
    const db = {
      select: () => ({ from: () => ({ where: async () => [sched] }) }),
      transaction: async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          select: () => ({ from: () => ({ where: () => ({ limit: async () => [wf] }) }) }),
          insert: () => ({ values: () => ({ onConflictDoNothing: () => ({ returning: async () => [{ id: "r1" }] }) }) }),
          update: () => ({ set: (v: typeof advance) => ({ where: async () => { advance = v; } }) }),
        };
        await fn(tx);
      },
    };
    await tickClaim(db as never, local(2026, 6, 5, 12, 4));
    expect(advance?.nextRunAt).toEqual(local(2026, 6, 5, 12, 5)); // strictly after now (12:04) → 12:05
    expect(advance?.lastRunAt).toEqual(local(2026, 6, 5, 12, 4)); // = now
    expect(advance?.missedCount).toBe(2 + 4); // skipped=5, missed += 5-1 = 4
  });

  test("đúng giờ (không trễ): missedCount += 0", async () => {
    let advance: { missedCount?: number } | undefined;
    const sched = { id: "s1", workflowId: "w1", userId: "u1", cron: "*/5 * * * *", nextRunAt: local(2026, 6, 5, 12, 5), missedCount: 7, enabled: true };
    const wf = { id: "w1", userId: "u1", graph: { nodes: [], edges: [] } };
    const db = {
      select: () => ({ from: () => ({ where: async () => [sched] }) }),
      transaction: async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          select: () => ({ from: () => ({ where: () => ({ limit: async () => [wf] }) }) }),
          insert: () => ({ values: () => ({ onConflictDoNothing: () => ({ returning: async () => [{ id: "r1" }] }) }) }),
          update: () => ({ set: (v: typeof advance) => ({ where: async () => { advance = v; } }) }),
        };
        await fn(tx);
      },
    };
    // now = 12:05:10 — chỉ vừa tới slot 12:05, không slot nào bị bỏ.
    await tickClaim(db as never, new Date(2026, 5, 5, 12, 5, 10, 0));
    expect(advance?.missedCount).toBe(7 + 0);
  });

  test("không schedule due → không transaction, claimed rỗng", async () => {
    let txCalls = 0;
    const db = {
      select: () => ({ from: () => ({ where: async () => [] }) }),
      transaction: async () => { txCalls++; },
    };
    const claimed = await tickClaim(db as never, local(2026, 6, 5, 12, 0));
    expect(claimed).toEqual([]);
    expect(txCalls).toBe(0);
  });
});

describe("tickExecute — chạy các run queued", () => {
  test("mỗi run queued → executeRunRow (status running→succeeded)", async () => {
    const runRows = [
      { id: "r1", workflowId: "w1", userId: "u1", graphSnapshot: { nodes: [{ id: "n1", kind: "agent", prompt: "x" }], edges: [] } },
      { id: "r2", workflowId: "w2", userId: "u2", graphSnapshot: { nodes: [{ id: "n1", kind: "agent", prompt: "y" }], edges: [] } },
    ];
    const finalized: { id: string; status: string }[] = [];
    const updates: { runId?: string; status?: string }[] = [];
    // db.select trả về danh sách run queued; update ghi status (theo where ta không
    // bắt được runId nên dùng publish để xác nhận từng run finalize).
    const db = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => runRows }) }) }),
      insert: () => ({ values: async () => {} }),
      update: () => ({ set: (v: { status?: string }) => ({ where: async () => { updates.push(v); } }) }),
    };
    const publish = vi.fn((e: { type: string; runId?: string; status?: string }) => {
      if (e.type === "workflow_run") finalized.push({ id: e.runId!, status: e.status! });
    });
    const buildRunNode = () => vi.fn(async () => "done");
    await tickExecute(db as never, { db: db as never, publish, buildRunNode });
    // cả 2 run đều finalize succeeded.
    expect(finalized.map((f) => f.id).sort()).toEqual(["r1", "r2"]);
    expect(finalized.every((f) => f.status === "succeeded")).toBe(true);
  });

  test("không run queued → no-op", async () => {
    const db = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
      update: () => ({ set: () => ({ where: async () => {} }) }),
    };
    const publish = vi.fn();
    await tickExecute(db as never, { db: db as never, publish, buildRunNode: () => vi.fn() });
    expect(publish).not.toHaveBeenCalled();
  });
});
