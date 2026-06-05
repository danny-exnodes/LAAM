import { describe, expect, test } from "vitest";
import type { WorkflowGraph, RunContext } from "./types";
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
