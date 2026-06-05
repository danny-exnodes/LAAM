import { describe, expect, test, vi } from "vitest";
import { runWorkflow } from "./engine";
import { emptyContext } from "./types";
import type { WorkflowGraph, StepRecord } from "./types";

const chain: WorkflowGraph = {
  nodes: [
    { id: "n1", kind: "connector", connectorId: "demo", action: "demo_list_tasks", args: {} },
    { id: "n2", kind: "agent", prompt: "Tóm tắt {{steps.n1.output.count}}." },
  ],
  edges: [{ from: "n1", to: "n2" }],
};

describe("runWorkflow (linear)", () => {
  test("chạy đúng thứ tự, truyền context, succeeded", async () => {
    const steps: StepRecord[] = [];
    const runNode = vi.fn(async (node) => (node.id === "n1" ? { count: 2 } : "OK"));
    const r = await runWorkflow(chain, { runNode, onStep: async (s) => { steps.push({ ...s }); } }, emptyContext({}));
    expect(r.status).toBe("succeeded");
    expect(runNode.mock.calls.map((c) => c[0].id)).toEqual(["n1", "n2"]);
    expect(r.context.steps["n1"].output).toEqual({ count: 2 });
    expect(r.context.steps["n2"].output).toBe("OK");
    expect(steps.map((s) => `${s.nodeId}:${s.status}`)).toEqual(["n1:running", "n1:succeeded", "n2:running", "n2:succeeded"]);
    expect(steps[0].seq).toBe(0);
    expect(steps[2].seq).toBe(1);
  });

  test("node lỗi → fail-stop, node sau KHÔNG chạy", async () => {
    const calls: string[] = [];
    const runNode = vi.fn(async (node) => { calls.push(node.id); if (node.id === "n1") throw new Error("boom"); return "x"; });
    const r = await runWorkflow(chain, { runNode, onStep: async () => {} }, emptyContext({}));
    expect(r.status).toBe("failed");
    expect(r.failedNodeId).toBe("n1");
    expect(r.error).toMatch(/boom/);
    expect(calls).toEqual(["n1"]);
  });

  test("graph branch → throw (validate gate)", async () => {
    const branch: WorkflowGraph = {
      nodes: [...chain.nodes, { id: "n3", kind: "agent", prompt: "y" }],
      edges: [{ from: "n1", to: "n2" }, { from: "n1", to: "n3" }],
    };
    await expect(runWorkflow(branch, { runNode: vi.fn(), onStep: async () => {} }, emptyContext({}))).rejects.toThrow(/branch|nhánh/i);
  });
});
