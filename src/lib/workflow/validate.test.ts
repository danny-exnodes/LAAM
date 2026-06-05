import { describe, expect, test } from "vitest";
import { assertLinear, linearOrder } from "./validate";
import type { WorkflowGraph } from "./types";

const chain: WorkflowGraph = {
  nodes: [
    { id: "n1", kind: "connector", connectorId: "demo", action: "demo_list_tasks", args: {} },
    { id: "n2", kind: "agent", prompt: "x" },
  ],
  edges: [{ from: "n1", to: "n2" }],
};

describe("validate (A0 — single-path acyclic)", () => {
  test("linearOrder trả đúng thứ tự từ start", () => {
    expect(linearOrder(chain).map((n) => n.id)).toEqual(["n1", "n2"]);
  });
  test("reject branch (>1 cạnh ra)", () => {
    const g: WorkflowGraph = {
      nodes: [...chain.nodes, { id: "n3", kind: "agent", prompt: "y" }],
      edges: [{ from: "n1", to: "n2" }, { from: "n1", to: "n3" }],
    };
    expect(() => assertLinear(g)).toThrow(/branch|nhánh/i);
  });
  test("reject cycle", () => {
    const g: WorkflowGraph = {
      nodes: chain.nodes,
      edges: [{ from: "n1", to: "n2" }, { from: "n2", to: "n1" }],
    };
    expect(() => assertLinear(g)).toThrow(/cycle|chu trình/i);
  });
  test("reject edge trỏ node không tồn tại", () => {
    const g: WorkflowGraph = { nodes: chain.nodes, edges: [{ from: "n1", to: "zzz" }] };
    expect(() => assertLinear(g)).toThrow(/unknown|không tồn tại/i);
  });
});
