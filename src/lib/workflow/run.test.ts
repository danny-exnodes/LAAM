import { describe, expect, test, vi } from "vitest";
import { executeRun } from "./run";
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
    insert: (table: unknown) => ({
      values: async (v: unknown) => { (inserted[String((table as Record<symbol, unknown>)[Symbol.for("drizzle:Name")] ?? "t")] ||= []).push(v); },
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
});
