import { describe, test, expect } from "vitest";
import { linearize, buildLinearGraph, nextStepId, makeStep, changeStepKind, moveStep } from "./foreach-body";
import type { WfNode, WorkflowGraph } from "@/lib/workflow/types";

const agent = (id: string): WfNode => ({ id, kind: "agent", prompt: "" });

describe("linearize", () => {
  test("empty/absent body → [] (valid empty linear)", () => {
    expect(linearize(undefined)).toEqual([]);
    expect(linearize({ nodes: [], edges: [] })).toEqual([]);
  });
  test("single node → [node]", () => {
    expect(linearize({ nodes: [agent("a")], edges: [] })?.map((n) => n.id)).toEqual(["a"]);
  });
  test("linear chain returned in EXECUTION order regardless of array order", () => {
    const g: WorkflowGraph = {
      nodes: [agent("c"), agent("a"), agent("b")],
      edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }],
    };
    expect(linearize(g)?.map((n) => n.id)).toEqual(["a", "b", "c"]);
  });
  test("branch (1→2 successors) → null", () => {
    expect(linearize({ nodes: [agent("a"), agent("b"), agent("c")], edges: [{ from: "a", to: "b" }, { from: "a", to: "c" }] })).toBeNull();
  });
  test("merge (2→1) → null", () => {
    expect(linearize({ nodes: [agent("a"), agent("b"), agent("c")], edges: [{ from: "a", to: "c" }, { from: "b", to: "c" }] })).toBeNull();
  });
  test("labeled edge (condition branch) → null", () => {
    expect(linearize({ nodes: [agent("a"), agent("b")], edges: [{ from: "a", to: "b", label: "true" }] })).toBeNull();
  });
  test("non-step kind (condition) → null", () => {
    const g = { nodes: [{ id: "a", kind: "condition", when: { left: "x", op: "eq", right: 1 } } as unknown as WfNode], edges: [] };
    expect(linearize(g)).toBeNull();
  });
  test("cycle → null; disconnected (two starts) → null", () => {
    expect(linearize({ nodes: [agent("a"), agent("b")], edges: [{ from: "a", to: "b" }, { from: "b", to: "a" }] })).toBeNull();
    expect(linearize({ nodes: [agent("a"), agent("b")], edges: [] })).toBeNull();
  });
});

describe("buildLinearGraph / helpers", () => {
  test("chains edges in order + preserves positions", () => {
    const g = buildLinearGraph([agent("a"), agent("b"), agent("c")], { nodes: [], edges: [], positions: { a: { x: 1, y: 2 } } });
    expect(g.edges).toEqual([{ from: "a", to: "b" }, { from: "b", to: "c" }]);
    expect(g.positions).toEqual({ a: { x: 1, y: 2 } });
  });
  test("nextStepId avoids collisions", () => {
    expect(nextStepId([])).toBe("b1");
    expect(nextStepId([agent("b1"), agent("b2")])).toBe("b3");
    expect(nextStepId([agent("b3")])).toBe("b2"); // length+1=2, free
  });
  test("makeStep + changeStepKind preserve id, swap shape", () => {
    expect(makeStep("connector", "b1")).toEqual({ id: "b1", kind: "connector", connectorId: "", action: "", args: {} });
    const a = agent("b1");
    expect(changeStepKind(a, "agent")).toBe(a); // same kind → identity
    expect(changeStepKind(a, "mcp")).toEqual({ id: "b1", kind: "mcp", server: "", tool: "", args: {} });
  });
  test("moveStep swaps neighbors; no-op at ends", () => {
    const ns = [agent("a"), agent("b"), agent("c")];
    expect(moveStep(ns, 0, 1).map((n) => n.id)).toEqual(["b", "a", "c"]);
    expect(moveStep(ns, 0, -1)).toBe(ns); // no-op
    expect(moveStep(ns, 2, 1)).toBe(ns); // no-op
  });
});
