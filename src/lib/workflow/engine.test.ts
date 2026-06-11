import { describe, expect, test, vi } from "vitest";
import { runWorkflow } from "./engine";
import { evalPredicate } from "./predicate";
import { emptyContext } from "./types";
import type { WorkflowGraph, StepRecord, WfNode, RunContext } from "./types";

const chain: WorkflowGraph = {
  nodes: [
    { id: "n1", kind: "connector", connectorId: "demo", action: "demo_list_tasks", args: {} },
    { id: "n2", kind: "agent", prompt: "Tóm tắt {{steps.n1.output.count}}." },
  ],
  edges: [{ from: "n1", to: "n2" }],
};

// helper deps: runNode trả theo map id→output; evalPredicate thật trừ khi override.
const noStep = async () => {};
const idOutput = (m: Record<string, unknown>) => vi.fn(async (n: WfNode) => m[n.id]);

describe("runWorkflow (linear)", () => {
  test("chạy đúng thứ tự, truyền context, succeeded", async () => {
    const steps: StepRecord[] = [];
    const runNode = vi.fn(async (node) => (node.id === "n1" ? { count: 2 } : "OK"));
    const r = await runWorkflow(chain, { runNode, onStep: async (s) => { steps.push({ ...s }); }, evalPredicate }, emptyContext({}));
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
    const r = await runWorkflow(chain, { runNode, onStep: noStep, evalPredicate }, emptyContext({}));
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
    await expect(runWorkflow(branch, { runNode: vi.fn(), onStep: noStep, evalPredicate }, emptyContext({}))).rejects.toThrow(/branch|nhánh/i);
  });
});

describe("runWorkflow (condition)", () => {
  const condGraph: WorkflowGraph = {
    nodes: [
      { id: "c", kind: "condition", when: { left: "{{steps.x.output}}", op: "gt", right: 0 } },
      { id: "t", kind: "agent", prompt: "yes" },
      { id: "f", kind: "agent", prompt: "no" },
    ],
    edges: [{ from: "c", to: "t", label: "true" }, { from: "c", to: "f", label: "false" }],
  };

  test("true-branch: chỉ chạy node 't'", async () => {
    const runNode = idOutput({ t: "TRUE", f: "FALSE" });
    const evalP = vi.fn(() => true);
    const r = await runWorkflow(condGraph, { runNode, onStep: noStep, evalPredicate: evalP }, emptyContext({}));
    expect(r.status).toBe("succeeded");
    expect(runNode.mock.calls.map((c) => (c[0] as WfNode).id)).toEqual(["t"]);
    expect(r.context.steps["c"].output).toBe(true);
    expect(r.context.steps["t"].output).toBe("TRUE");
    expect(r.context.steps["f"]).toBeUndefined();
  });

  test("false-branch: chỉ chạy node 'f'", async () => {
    const runNode = idOutput({ t: "TRUE", f: "FALSE" });
    const evalP = vi.fn(() => false);
    const r = await runWorkflow(condGraph, { runNode, onStep: noStep, evalPredicate: evalP }, emptyContext({}));
    expect(runNode.mock.calls.map((c) => (c[0] as WfNode).id)).toEqual(["f"]);
    expect(r.context.steps["c"].output).toBe(false);
    expect(r.context.steps["f"].output).toBe("FALSE");
    expect(r.context.steps["t"]).toBeUndefined();
  });
});

describe("runWorkflow (foreach)", () => {
  const feGraph: WorkflowGraph = {
    nodes: [
      { id: "src", kind: "connector", connectorId: "demo", action: "list", args: {} },
      { id: "loop", kind: "foreach", items: "{{steps.src.output}}", body: { nodes: [{ id: "b", kind: "agent", prompt: "do {{vars.item}}" }], edges: [] } },
    ],
    edges: [{ from: "src", to: "loop" }],
  };

  test("chạy body mỗi item với vars.item; output = mảng kết quả", async () => {
    const seenItems: unknown[] = [];
    const seenIndexes: unknown[] = [];
    const runNode = vi.fn(async (node: WfNode, ctx: RunContext) => {
      if (node.id === "src") return ["a", "b"];
      seenItems.push(ctx.vars.item);
      seenIndexes.push(ctx.vars.index);
      return `R:${String(ctx.vars.item)}`;
    });
    const r = await runWorkflow(feGraph, { runNode, onStep: noStep, evalPredicate }, emptyContext({}));
    expect(r.status).toBe("succeeded");
    expect(seenItems).toEqual(["a", "b"]);
    expect(seenIndexes).toEqual([0, 1]);
    expect(r.context.steps["loop"].output).toEqual(["R:a", "R:b"]);
  });

  test("body isolation: mỗi iteration có steps riêng (không rò rỉ)", async () => {
    const sawBKeys: string[][] = [];
    const runNode = vi.fn(async (node: WfNode, ctx: RunContext) => {
      if (node.id === "src") return ["a", "b"];
      sawBKeys.push(Object.keys(ctx.steps)); // body's ctx.steps phải rỗng đầu mỗi vòng
      return 1;
    });
    await runWorkflow(feGraph, { runNode, onStep: noStep, evalPredicate }, emptyContext({}));
    expect(sawBKeys).toEqual([[], []]); // không thấy step của vòng trước
  });

  test("foreach children emit parentNodeId = id foreach", async () => {
    const steps: StepRecord[] = [];
    const runNode = vi.fn(async (node: WfNode) => (node.id === "src" ? ["a"] : "x"));
    await runWorkflow(feGraph, { runNode, onStep: async (s) => { steps.push({ ...s }); }, evalPredicate }, emptyContext({}));
    const bRunning = steps.find((s) => s.nodeId === "b" && s.status === "running");
    expect(bRunning?.parentNodeId).toBe("loop");
  });

  test("foreach items không phải mảng → throw", async () => {
    const runNode = vi.fn(async (node: WfNode) => (node.id === "src" ? { not: "array" } : "x"));
    await expect(runWorkflow(feGraph, { runNode, onStep: noStep, evalPredicate }, emptyContext({}))).rejects.toThrow(/array|mảng/i);
  });

  test("body lỗi → fail-stop, foreach failed", async () => {
    const runNode = vi.fn(async (node: WfNode, ctx: RunContext) => {
      if (node.id === "src") return ["a", "b"];
      if (ctx.vars.item === "b") throw new Error("body boom");
      return "ok";
    });
    const r = await runWorkflow(feGraph, { runNode, onStep: noStep, evalPredicate }, emptyContext({}));
    expect(r.status).toBe("failed");
    expect(r.error).toMatch(/body boom/);
  });
});

describe("runWorkflow (budget)", () => {
  test("maxSteps vượt → throw /budget/", async () => {
    const g: WorkflowGraph = {
      nodes: [
        { id: "a", kind: "agent", prompt: "a" },
        { id: "b", kind: "agent", prompt: "b" },
        { id: "c", kind: "agent", prompt: "c" },
      ],
      edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }],
    };
    const runNode = idOutput({ a: 1, b: 2, c: 3 });
    await expect(
      runWorkflow(g, { runNode, onStep: noStep, evalPredicate }, emptyContext({}), { maxSteps: 2, maxForeachItems: 100 }),
    ).rejects.toThrow(/budget/i);
  });

  test("maxForeachItems vượt → throw /foreach/", async () => {
    const g: WorkflowGraph = {
      nodes: [
        { id: "src", kind: "connector", connectorId: "demo", action: "list", args: {} },
        { id: "loop", kind: "foreach", items: "{{steps.src.output}}", body: { nodes: [{ id: "b", kind: "agent", prompt: "x" }], edges: [] } },
      ],
      edges: [{ from: "src", to: "loop" }],
    };
    const runNode = vi.fn(async (node: WfNode) => (node.id === "src" ? [1, 2, 3, 4] : "x"));
    await expect(
      runWorkflow(g, { runNode, onStep: noStep, evalPredicate }, emptyContext({}), { maxSteps: 200, maxForeachItems: 3 }),
    ).rejects.toThrow(/foreach/i);
  });

  test("budget đếm node LỒNG trong foreach (shared counter)", async () => {
    // foreach 3 item, body 1 node → 1(src)+1(foreach)+3(body) = 5 lần exec. maxSteps=4 → throw.
    const g: WorkflowGraph = {
      nodes: [
        { id: "src", kind: "connector", connectorId: "demo", action: "list", args: {} },
        { id: "loop", kind: "foreach", items: "{{steps.src.output}}", body: { nodes: [{ id: "b", kind: "agent", prompt: "x" }], edges: [] } },
      ],
      edges: [{ from: "src", to: "loop" }],
    };
    const runNode = vi.fn(async (node: WfNode) => (node.id === "src" ? [1, 2, 3] : "x"));
    await expect(
      runWorkflow(g, { runNode, onStep: noStep, evalPredicate }, emptyContext({}), { maxSteps: 4, maxForeachItems: 100 }),
    ).rejects.toThrow(/budget/i);
  });
});

// W4 cancel — shouldStop (DI): re-check TRUOC moi node. Y nghia: user huy run dang chay
// → node ke tiep KHONG duoc thuc thi (side-effect that!), run KHONG bi danh failed,
// va cac step da xong van duoc emit du de persist.
describe("runWorkflow (cancel — shouldStop W4)", () => {
  test("shouldStop=true giữa 2 node → node sau KHÔNG chạy, status cancelled (không failed)", async () => {
    let stop = false;
    const steps: StepRecord[] = [];
    const runNode = vi.fn(async (node: WfNode) => { stop = true; return node.id === "n1" ? { count: 1 } : "x"; });
    const r = await runWorkflow(
      chain,
      { runNode, onStep: async (s) => { steps.push({ ...s }); }, evalPredicate, shouldStop: async () => stop },
      emptyContext({}),
    );
    expect(r.status).toBe("cancelled");
    expect(r.error).toBeUndefined();
    expect(runNode.mock.calls.map((c) => (c[0] as WfNode).id)).toEqual(["n1"]); // n2 không chạy
    // step n1 đã xong vẫn emit đủ running→succeeded (persist); KHÔNG có step failed.
    expect(steps.map((s) => `${s.nodeId}:${s.status}`)).toEqual(["n1:running", "n1:succeeded"]);
  });

  test("shouldStop=true ngay từ đầu → không node nào chạy", async () => {
    const runNode = vi.fn();
    const r = await runWorkflow(chain, { runNode, onStep: noStep, evalPredicate, shouldStop: async () => true }, emptyContext({}));
    expect(r.status).toBe("cancelled");
    expect(runNode).not.toHaveBeenCalled();
  });

  test("shouldStop dừng cả TRONG body foreach (item sau không chạy)", async () => {
    const g: WorkflowGraph = {
      nodes: [{ id: "loop", kind: "foreach", items: "{{trigger.items}}", body: { nodes: [{ id: "b", kind: "agent", prompt: "x" }], edges: [] } }],
      edges: [],
    };
    let stop = false;
    const runNode = vi.fn(async () => { stop = true; return "y"; });
    const r = await runWorkflow(g, { runNode, onStep: noStep, evalPredicate, shouldStop: async () => stop }, emptyContext({ items: [1, 2, 3] }));
    expect(r.status).toBe("cancelled");
    expect(runNode).toHaveBeenCalledTimes(1); // chỉ item đầu — item 2,3 bị dừng
  });
});
