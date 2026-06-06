import { describe, expect, test, vi } from "vitest";
import { executeRun, executeRunRow } from "./run";
import type { WorkflowGraph } from "./types";

const graph: WorkflowGraph = {
  nodes: [
    { id: "n1", kind: "connector", connectorId: "demo", action: "demo_list_tasks", args: {} },
    { id: "n2", kind: "agent", prompt: "Tóm tắt {{steps.n1.output.count}}." },
  ],
  edges: [{ from: "n1", to: "n2" }],
};

function fakeDb(workflowRow: unknown) {
  const inserted: Record<string, unknown[]> = {};
  const updated: unknown[] = [];
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => (workflowRow ? [workflowRow] : []) }) }) }),
    // insert(table).values(v): awaitable (onStep) AND chainable to .onConflictDoNothing().returning()
    // (withWriteIdempotency.claimNode records initial-run writes — F1). Fresh run → returning [{id}].
    insert: (table: unknown) => ({
      values: (v: unknown) => {
        (inserted[String((table as Record<symbol, unknown>)[Symbol.for("drizzle:Name")] ?? "t")] ||= []).push(v);
        return {
          onConflictDoNothing: () => ({ returning: async () => [{ id: "idem" }] }),
          then: (resolve: (x: unknown) => void) => resolve(undefined),
        };
      },
    }),
    update: () => ({ set: (v: unknown) => ({ where: async () => { updated.push(v); } }) }),
  };
  return { db, inserted, updated };
}

describe("executeRun", () => {
  test("404 nếu workflow không thuộc user", async () => {
    const { db } = fakeDb(null);
    const publish = vi.fn();
    const r = await executeRun({ workflowId: "w1", userId: "u1", trigger: "manual" }, { db: db as never, publish, buildRunNode: () => vi.fn() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(404);
  });

  test("chạy → run + step + SSE + status succeeded", async () => {
    const { db, updated } = fakeDb({ id: "w1", userId: "u1", graph });
    const publish = vi.fn();
    const buildRunNode = () => vi.fn(async (node: { id: string }) => (node.id === "n1" ? { count: 2 } : "Tóm tắt xong."));
    const r = await executeRun({ workflowId: "w1", userId: "u1", trigger: "manual" }, { db: db as never, publish, buildRunNode });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.run.status).toBe("succeeded");
      expect(r.steps.map((s) => s.nodeId)).toEqual(["n1", "n2"]);
    }
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ type: "workflow_run_step", nodeId: "n1" }));
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ type: "workflow_run", status: "succeeded" }));
    expect(updated.some((u) => (u as { status?: string }).status === "succeeded")).toBe(true);
  });

  test("run_step.input được populate (connector node)", async () => {
    const g: WorkflowGraph = {
      // {{trigger.source}} có sẵn (executeRun set source=trigger) → interpolate ra "manual".
      nodes: [{ id: "n1", kind: "connector", connectorId: "demo", action: "demo_create", args: { title: "{{trigger.source}}" } }],
      edges: [],
    };
    const { db, inserted } = fakeDb({ id: "w1", userId: "u1", graph: g });
    const buildRunNode = () => vi.fn(async () => "ok");
    await executeRun({ workflowId: "w1", userId: "u1", trigger: "manual" }, { db: db as never, publish: vi.fn(), buildRunNode });
    const stepRows = inserted["workflow_run_step"] ?? [];
    expect(stepRows).toHaveLength(1);
    // input = args đã interpolate. Cốt yếu: input populate đúng giá trị resolve.
    expect((stepRows[0] as { input?: Record<string, unknown> }).input).toEqual({ title: "manual" });
  });

  test("foreach child step gắn parentStepId", async () => {
    const g: WorkflowGraph = {
      nodes: [
        { id: "src", kind: "connector", connectorId: "demo", action: "list", args: {} },
        { id: "loop", kind: "foreach", items: "{{steps.src.output}}", body: { nodes: [{ id: "b", kind: "agent", prompt: "x" }], edges: [] } },
      ],
      edges: [{ from: "src", to: "loop" }],
    };
    const { db, inserted } = fakeDb({ id: "w1", userId: "u1", graph: g });
    const buildRunNode = () => vi.fn(async (node: { id: string }) => (node.id === "src" ? ["a"] : "done"));
    await executeRun({ workflowId: "w1", userId: "u1", trigger: "manual" }, { db: db as never, publish: vi.fn(), buildRunNode });
    const stepRows = (inserted["workflow_run_step"] ?? []) as { id: string; nodeId: string; parentStepId?: string | null }[];
    const loopRow = stepRows.find((s) => s.nodeId === "loop");
    const bodyRow = stepRows.find((s) => s.nodeId === "b");
    expect(loopRow).toBeDefined();
    expect(bodyRow).toBeDefined();
    expect(bodyRow!.parentStepId).toBe(loopRow!.id); // child trỏ row của foreach
  });

  test("engine throw (budget) → run finalize FAILED (không kẹt running) + SSE failed", async () => {
    const g: WorkflowGraph = {
      nodes: [
        { id: "a", kind: "agent", prompt: "a" },
        { id: "b", kind: "agent", prompt: "b" },
        { id: "c", kind: "agent", prompt: "c" },
      ],
      edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }],
    };
    const { db, updated } = fakeDb({ id: "w1", userId: "u1", graph: g });
    const publish = vi.fn();
    const buildRunNode = () => vi.fn(async () => "x");
    const r = await executeRun(
      { workflowId: "w1", userId: "u1", trigger: "manual" },
      { db: db as never, publish, buildRunNode, budget: { maxSteps: 2, maxForeachItems: 100 } },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.run.status).toBe("failed");
    // run row finalize = failed (KHÔNG kẹt running) + có error.
    const runFinal = updated.find((u) => (u as { status?: string }).status === "failed") as { status?: string; error?: string } | undefined;
    expect(runFinal).toBeDefined();
    expect(runFinal!.error).toMatch(/budget/i);
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ type: "workflow_run", status: "failed" }));
  });

  test("executeRunRow chạy row CÓ SẴN (queued→running→succeeded) + finalize + SSE", async () => {
    // Không select workflow (row đã có graphSnapshot). Mô phỏng row queued từ tickClaim.
    const updated: { status?: string; startedAt?: Date; finishedAt?: Date }[] = [];
    const inserted: unknown[] = [];
    const db = {
      insert: () => ({ values: async (v: unknown) => { inserted.push(v); } }),
      update: () => ({ set: (v: { status?: string }) => ({ where: async () => { updated.push(v); } }) }),
    };
    const publish = vi.fn();
    const buildRunNode = () => vi.fn(async (node: { id: string }) => (node.id === "n1" ? { count: 3 } : "ok"));
    const { status, steps } = await executeRunRow(
      { id: "r1", workflowId: "w1", userId: "u1", graphSnapshot: graph, trigger: "schedule" },
      { db: db as never, publish, buildRunNode },
    );
    expect(status).toBe("succeeded");
    expect(steps.map((s) => s.nodeId)).toEqual(["n1", "n2"]);
    // phải set running TRƯỚC (có startedAt) rồi mới succeeded.
    expect(updated.some((u) => u.status === "running" && u.startedAt instanceof Date)).toBe(true);
    expect(updated.some((u) => u.status === "succeeded" && u.finishedAt instanceof Date)).toBe(true);
    // thứ tự: running trước succeeded.
    const iRun = updated.findIndex((u) => u.status === "running");
    const iDone = updated.findIndex((u) => u.status === "succeeded");
    expect(iRun).toBeLessThan(iDone);
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ type: "workflow_run", runId: "r1", status: "succeeded" }));
  });

  test("executeRunRow finalize FAILED khi engine throw (budget)", async () => {
    const g: WorkflowGraph = {
      nodes: [
        { id: "a", kind: "agent", prompt: "a" },
        { id: "b", kind: "agent", prompt: "b" },
      ],
      edges: [{ from: "a", to: "b" }],
    };
    const updated: { status?: string; error?: string }[] = [];
    const db = {
      insert: () => ({ values: async () => {} }),
      update: () => ({ set: (v: { status?: string }) => ({ where: async () => { updated.push(v); } }) }),
    };
    const publish = vi.fn();
    const buildRunNode = () => vi.fn(async () => "x");
    const { status } = await executeRunRow(
      { id: "r1", workflowId: "w1", userId: "u1", graphSnapshot: g, trigger: "schedule" },
      { db: db as never, publish, buildRunNode, budget: { maxSteps: 1, maxForeachItems: 100 } },
    );
    expect(status).toBe("failed");
    const failed = updated.find((u) => u.status === "failed");
    expect(failed).toBeDefined();
    expect(failed!.error).toMatch(/budget/i);
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ type: "workflow_run", status: "failed" }));
  });

  test("lỗi insert onStep (fail-soft) KHÔNG làm hỏng run", async () => {
    // db.insert step ném ở row đầu → run vẫn chạy tiếp, finalize bình thường.
    const insertCalls = { n: 0 };
    const updated: unknown[] = [];
    const db = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: "w1", userId: "u1", graph }] }) }) }),
      insert: (table: unknown) => ({
        values: async () => {
          const name = String((table as Record<symbol, unknown>)[Symbol.for("drizzle:Name")] ?? "");
          if (name === "workflow_run_step") { insertCalls.n++; if (insertCalls.n === 1) throw new Error("transient insert fail"); }
        },
      }),
      update: () => ({ set: (v: unknown) => ({ where: async () => { updated.push(v); } }) }),
    };
    const buildRunNode = () => vi.fn(async (node: { id: string }) => (node.id === "n1" ? { count: 2 } : "ok"));
    const r = await executeRun({ workflowId: "w1", userId: "u1", trigger: "manual" }, { db: db as never, publish: vi.fn(), buildRunNode });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.run.status).toBe("succeeded"); // node KHÔNG lỗi → run vẫn succeeded dù 1 insert step fail
  });

  test("dryRun=true xuyên executeRun → buildRunNode + persist dryRun trên run row", async () => {
    const { db, inserted } = fakeDb({ id: "w1", userId: "u1", graph });
    const inner = vi.fn(async (node: { id: string }) => (node.id === "n1" ? { count: 1 } : "ok"));
    const buildRunNode = vi.fn(() => inner);
    await executeRun(
      { workflowId: "w1", userId: "u1", trigger: "manual", dryRun: true },
      { db: db as never, publish: vi.fn(), buildRunNode },
    );
    // Wiring: cờ dry-run phải tới buildRunNode (nơi mock write thật sự diễn ra).
    expect(buildRunNode).toHaveBeenCalledWith("u1", { dryRun: true });
    // + persist trên run row để run-history hiện badge "Thử".
    const runRow = (inserted["workflow_run"] ?? [])[0] as { dryRun?: boolean };
    expect(runRow?.dryRun).toBe(true);
  });
});
