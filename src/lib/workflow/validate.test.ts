import { describe, expect, test } from "vitest";
import { assertLinear, assertRunnable, linearOrder } from "./validate";
import type { WorkflowGraph, Predicate } from "./types";

const chain: WorkflowGraph = {
  nodes: [
    { id: "n1", kind: "connector", connectorId: "demo", action: "demo_list_tasks", args: {} },
    { id: "n2", kind: "agent", prompt: "x" },
  ],
  edges: [{ from: "n1", to: "n2" }],
};

const pred: Predicate = { left: "{{steps.n1.output.n}}", op: "gt", right: 0 };

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

describe("validate v2 (assertRunnable — condition branch + foreach body)", () => {
  test("A0 linear graph vẫn hợp lệ", () => {
    expect(() => assertRunnable(chain)).not.toThrow();
  });

  test("single node (0 edge) hợp lệ", () => {
    expect(() => assertRunnable({ nodes: [{ id: "a", kind: "agent", prompt: "x" }], edges: [] })).not.toThrow();
  });

  test("condition với true+false edge = hợp lệ", () => {
    const g: WorkflowGraph = {
      nodes: [
        { id: "c", kind: "condition", when: pred },
        { id: "t", kind: "agent", prompt: "yes" },
        { id: "f", kind: "agent", prompt: "no" },
      ],
      edges: [{ from: "c", to: "t", label: "true" }, { from: "c", to: "f", label: "false" }],
    };
    expect(() => assertRunnable(g)).not.toThrow();
  });

  test("condition chỉ 1 edge → throw", () => {
    const g: WorkflowGraph = {
      nodes: [{ id: "c", kind: "condition", when: pred }, { id: "t", kind: "agent", prompt: "yes" }],
      edges: [{ from: "c", to: "t", label: "true" }],
    };
    expect(() => assertRunnable(g)).toThrow(/condition/i);
  });

  test("condition thiếu label true/false → throw", () => {
    const g: WorkflowGraph = {
      nodes: [
        { id: "c", kind: "condition", when: pred },
        { id: "t", kind: "agent", prompt: "yes" },
        { id: "f", kind: "agent", prompt: "no" },
      ],
      edges: [{ from: "c", to: "t", label: "true" }, { from: "c", to: "f", label: "maybe" }],
    };
    expect(() => assertRunnable(g)).toThrow(/true.*false|label/i);
  });

  test("node thường (không condition) có 2 cạnh ra → throw branch", () => {
    const g: WorkflowGraph = {
      nodes: [...chain.nodes, { id: "n3", kind: "agent", prompt: "y" }],
      edges: [{ from: "n1", to: "n2" }, { from: "n1", to: "n3" }],
    };
    expect(() => assertRunnable(g)).toThrow(/branch|nhánh/i);
  });

  test("fan-in (>1 cạnh vào) → throw", () => {
    const g: WorkflowGraph = {
      nodes: [
        { id: "a", kind: "agent", prompt: "a" },
        { id: "b", kind: "agent", prompt: "b" },
        { id: "c", kind: "agent", prompt: "c" },
      ],
      edges: [{ from: "a", to: "c" }, { from: "b", to: "c" }],
    };
    expect(() => assertRunnable(g)).toThrow(/merge|fan-in|cạnh vào/i);
  });

  test("foreach với body hợp lệ = hợp lệ", () => {
    const g: WorkflowGraph = {
      nodes: [{ id: "loop", kind: "foreach", items: "{{steps.x.output}}", body: { nodes: [{ id: "b1", kind: "agent", prompt: "{{vars.item}}" }], edges: [] } }],
      edges: [],
    };
    expect(() => assertRunnable(g)).not.toThrow();
  });

  test("foreach với body không hợp lệ (branch trong body) → throw", () => {
    const g: WorkflowGraph = {
      nodes: [{
        id: "loop", kind: "foreach", items: "{{steps.x.output}}",
        body: {
          nodes: [{ id: "b1", kind: "agent", prompt: "x" }, { id: "b2", kind: "agent", prompt: "y" }, { id: "b3", kind: "agent", prompt: "z" }],
          edges: [{ from: "b1", to: "b2" }, { from: "b1", to: "b3" }],
        },
      }],
      edges: [],
    };
    expect(() => assertRunnable(g)).toThrow(/branch|nhánh/i);
  });

  test("cycle qua nhánh condition → throw", () => {
    const g: WorkflowGraph = {
      nodes: [
        { id: "c", kind: "condition", when: pred },
        { id: "t", kind: "agent", prompt: "yes" },
        { id: "f", kind: "agent", prompt: "no" },
      ],
      // t quay lại c → tạo cạnh-vào thứ 2 cho c (fan-in) HOẶC chu trình; phải bị từ chối.
      edges: [{ from: "c", to: "t", label: "true" }, { from: "c", to: "f", label: "false" }, { from: "t", to: "c" }],
    };
    expect(() => assertRunnable(g)).toThrow(/cycle|chu trình|merge|fan-in|cạnh vào/i);
  });

  test("foreach body có thể nhận condition (đệ quy)", () => {
    const g: WorkflowGraph = {
      nodes: [{
        id: "loop", kind: "foreach", items: "{{steps.x.output}}",
        body: {
          nodes: [
            { id: "c", kind: "condition", when: pred },
            { id: "t", kind: "agent", prompt: "{{vars.item}}" },
            { id: "f", kind: "agent", prompt: "skip" },
          ],
          edges: [{ from: "c", to: "t", label: "true" }, { from: "c", to: "f", label: "false" }],
        },
      }],
      edges: [],
    };
    expect(() => assertRunnable(g)).not.toThrow();
  });
});
