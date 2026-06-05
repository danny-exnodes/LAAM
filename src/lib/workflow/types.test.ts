import { describe, expect, test } from "vitest";
import type { WorkflowGraph, RunContext, Predicate, Budget } from "./types";
import { emptyContext } from "./types";

describe("workflow types", () => {
  test("emptyContext khởi tạo blackboard rỗng", () => {
    const ctx: RunContext = emptyContext({ source: "manual" });
    expect(ctx.steps).toEqual({});
    expect(ctx.trigger).toEqual({ source: "manual" });
  });

  test("graph 1 connector → 1 agent hợp khuôn", () => {
    const g: WorkflowGraph = {
      nodes: [
        { id: "n1", kind: "connector", connectorId: "demo", action: "demo_list_tasks", args: {} },
        { id: "n2", kind: "agent", prompt: "Tóm tắt {{steps.n1.output.count}} việc." },
      ],
      edges: [{ from: "n1", to: "n2" }],
    };
    expect(g.nodes).toHaveLength(2);
  });
});

describe("workflow v2 types", () => {
  test("v2 graph: foreach + condition compiles", () => {
    const pred: Predicate = { all: [{ left: "{{steps.a.output.n}}", op: "gt", right: 0 }] };
    const g: WorkflowGraph = {
      nodes: [
        { id: "loop", kind: "foreach", items: "{{steps.fetch.output}}", body: { nodes: [{ id: "b1", kind: "agent", prompt: "x {{vars.item}}" }], edges: [] } },
        { id: "c", kind: "condition", when: pred },
      ],
      edges: [{ from: "loop", to: "c" }, { from: "c", to: "loop", label: "false" }],
    };
    expect(g.nodes).toHaveLength(2);
    const _b: Budget = { maxSteps: 100, maxForeachItems: 50 };
    expect(_b.maxSteps).toBe(100);
  });
});
