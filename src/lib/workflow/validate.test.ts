import { describe, expect, test } from "vitest";
import { assertLinear, assertRunnable, collectIssues, linearOrder } from "./validate";
import type { WfIssueCode } from "./validate";
import type { WorkflowGraph, Predicate } from "./types";
import { MAX_FANOUT } from "./types";

const codes = (g: WorkflowGraph): WfIssueCode[] => collectIssues(g).map((i) => i.code).sort();

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

  // ── B1: agent.format (structured output) phải là plain object nếu có ──
  test("agent format là object JSON-schema → hợp lệ", () => {
    const g: WorkflowGraph = {
      nodes: [{ id: "j", kind: "agent", prompt: "x", format: { type: "object" } }],
      edges: [],
    };
    expect(() => assertRunnable(g)).not.toThrow();
  });

  test("agent format là array → throw message rõ", () => {
    const g = {
      nodes: [{ id: "j", kind: "agent", prompt: "x", format: [1, 2] }],
      edges: [],
    } as unknown as WorkflowGraph;
    expect(() => assertRunnable(g)).toThrow(/format.*object/i);
  });

  test("agent format là string → throw", () => {
    const g = {
      nodes: [{ id: "j", kind: "agent", prompt: "x", format: '{"type":"object"}' }],
      edges: [],
    } as unknown as WorkflowGraph;
    expect(() => assertRunnable(g)).toThrow(/format.*object/i);
  });

  test("agent format hỏng trong foreach body cũng bị reject (đệ quy)", () => {
    const g = {
      nodes: [{
        id: "loop", kind: "foreach", items: "{{steps.x.output}}",
        body: { nodes: [{ id: "j", kind: "agent", prompt: "x", format: "bad" }], edges: [] },
      }],
      edges: [],
    } as unknown as WorkflowGraph;
    expect(() => assertRunnable(g)).toThrow(/format.*object/i);
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

// P2: mcp node đi qua validate như node tuyến tính thường (≤1 cạnh ra, không nhánh).
describe("validate — mcp node (P2)", () => {
  test("graph chứa mcp node hợp lệ → pass", () => {
    const g: WorkflowGraph = {
      nodes: [
        { id: "m1", kind: "mcp", server: "daab", tool: "kg_query", args: { project_id: "p" } },
        { id: "a1", kind: "agent", prompt: "tóm tắt {{steps.m1.output}}" },
      ],
      edges: [{ from: "m1", to: "a1" }],
    };
    expect(() => assertRunnable(g)).not.toThrow();
  });

  test("mcp node phân nhánh (2 cạnh ra) → throw như mọi node non-condition", () => {
    const g: WorkflowGraph = {
      nodes: [
        { id: "m1", kind: "mcp", server: "daab", tool: "kg_query", args: {} },
        { id: "a1", kind: "agent", prompt: "x" },
        { id: "a2", kind: "agent", prompt: "y" },
      ],
      edges: [{ from: "m1", to: "a1" }, { from: "m1", to: "a2" }],
    };
    expect(() => assertRunnable(g)).toThrow(/branch|nhánh|condition/i);
  });
});

describe("collectIssues (structured, multi-fault, advisory)", () => {
  test("valid graph → no issues (parity: assertRunnable also passes)", () => {
    expect(collectIssues(chain)).toEqual([]);
    expect(() => assertRunnable(chain)).not.toThrow();
  });

  test("empty graph → no issues", () => {
    expect(collectIssues({ nodes: [], edges: [] })).toEqual([]);
  });

  test("surfaces MULTIPLE faults at once (a throw-based gate can only see one)", () => {
    // WHY: the whole point of the collector is that an author sees EVERY problem
    // in one pass. This graph has a bad condition AND a node with two faults.
    const g: WorkflowGraph = {
      nodes: [
        { id: "c1", kind: "condition", when: { left: "a", op: "eq", right: "b" } },
        { id: "a1", kind: "agent", prompt: "x" },
        { id: "a2", kind: "agent", prompt: "y" },
      ],
      // c1 has only one (unlabeled) out-edge → condition_branches; a1 fans into a2
      // from two sources → fan_in.
      edges: [
        { from: "c1", to: "a1" },
        { from: "c1", to: "a2", label: "true" },
        { from: "a1", to: "a2" },
      ],
    };
    const found = codes(g);
    expect(found).toContain("condition_branches");
    expect(found).toContain("fan_in");
    expect(found.length).toBeGreaterThanOrEqual(2);
  });

  test("pins a foreach-body fault to the NESTED node id (prefixed)", () => {
    // WHY: a fault buried inside a foreach body must be locatable — the id is
    // prefixed with the foreach node so the editor can point at it.
    const g: WorkflowGraph = {
      nodes: [
        {
          id: "f1",
          kind: "foreach",
          items: "{{items}}",
          body: {
            // duplicate id inside the body
            nodes: [
              { id: "b1", kind: "agent", prompt: "x" },
              { id: "b1", kind: "agent", prompt: "y" },
            ],
            edges: [],
          },
        },
      ],
      edges: [],
    };
    const issues = collectIssues(g);
    const dup = issues.find((i) => i.code === "dup_id");
    expect(dup?.nodeId).toBe("f1/b1");
  });

  test("detects cycle (no start) and pins fan_in / condition faults to their node", () => {
    const cyc: WorkflowGraph = {
      nodes: [
        { id: "n1", kind: "agent", prompt: "x" },
        { id: "n2", kind: "agent", prompt: "y" },
      ],
      edges: [
        { from: "n1", to: "n2" },
        { from: "n2", to: "n1" },
      ],
    };
    const found = codes(cyc);
    // every node has an in-edge ⇒ no_start, and n1/n2 each receive an in-edge so
    // neither is flagged fan_in (exactly one in each). assertRunnable also throws.
    expect(found).toContain("no_start");
    expect(() => assertRunnable(cyc)).toThrow();
  });

  // ── P: nhánh parallel (graph.parallel===true) ──────────────────────────────
  const parDiamond: WorkflowGraph = {
    parallel: true,
    nodes: [
      { id: "s", kind: "agent", prompt: "x" },
      { id: "a", kind: "agent", prompt: "x" },
      { id: "b", kind: "agent", prompt: "x" },
      { id: "j", kind: "agent", prompt: "{{steps.a.output}} {{steps.b.output}}" },
    ],
    edges: [
      { from: "s", to: "a" }, { from: "s", to: "b" }, { from: "a", to: "j" }, { from: "b", to: "j" },
    ],
  };

  test("parallel: diamond (fan-out + fan-in) HỢP LỆ — KHÔNG bị nhầm là cycle (fix false-cycle)", () => {
    expect(() => assertRunnable(parDiamond)).not.toThrow();
    expect(collectIssues(parDiamond)).toEqual([]);
  });

  test("parallel: multi-start hợp lệ", () => {
    const g: WorkflowGraph = {
      parallel: true,
      nodes: [
        { id: "s1", kind: "agent", prompt: "x" },
        { id: "s2", kind: "agent", prompt: "y" },
        { id: "j", kind: "agent", prompt: "{{steps.s1.output}} {{steps.s2.output}}" },
      ],
      edges: [{ from: "s1", to: "j" }, { from: "s2", to: "j" }],
    };
    expect(() => assertRunnable(g)).not.toThrow();
    expect(collectIssues(g)).toEqual([]);
  });

  test("parallel: ref {{steps.X}} tới node KHÔNG phải tổ tiên → throw + code ref_not_ancestor", () => {
    const g: WorkflowGraph = {
      parallel: true,
      nodes: [
        { id: "a", kind: "agent", prompt: "x" },
        { id: "b", kind: "agent", prompt: "đọc {{steps.a.output}}" }, // a KHÔNG nối tới b
      ],
      edges: [],
    };
    expect(() => assertRunnable(g)).toThrow(/tổ tiên|ancestor/i);
    expect(codes(g)).toContain("ref_not_ancestor");
  });

  test("parallel: ref tới tổ tiên transitive (a→b→c, c ref a) → hợp lệ", () => {
    const g: WorkflowGraph = {
      parallel: true,
      nodes: [
        { id: "a", kind: "agent", prompt: "x" },
        { id: "b", kind: "agent", prompt: "y" },
        { id: "c", kind: "agent", prompt: "đọc {{steps.a.output}}" },
      ],
      edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }],
    };
    expect(() => assertRunnable(g)).not.toThrow();
  });

  test("parallel: fan-out vượt MAX_FANOUT → throw", () => {
    const targets = Array.from({ length: MAX_FANOUT + 1 }, (_, i) => ({ id: `t${i}`, kind: "agent" as const, prompt: "x" }));
    const g: WorkflowGraph = {
      parallel: true,
      nodes: [{ id: "s", kind: "agent", prompt: "x" }, ...targets],
      edges: targets.map((t) => ({ from: "s", to: t.id })),
    };
    expect(() => assertRunnable(g)).toThrow(/fan-out/i);
    expect(codes(g)).toContain("multi_out");
  });

  test("parallel: cycle THẬT (b→c→b) vẫn bị bắt (Kahn)", () => {
    const g: WorkflowGraph = {
      parallel: true,
      nodes: [
        { id: "a", kind: "agent", prompt: "x" },
        { id: "b", kind: "agent", prompt: "x" },
        { id: "c", kind: "agent", prompt: "x" },
      ],
      edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "b" }],
    };
    expect(() => assertRunnable(g)).toThrow(/cycle|chu trình/i);
    expect(codes(g)).toContain("cycle");
  });

  test("KHÔNG parallel: fan-in vẫn bị TỪ CHỐI (bất biến tuyến tính giữ nguyên)", () => {
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

  test("DRIFT GUARD (parallel): collectIssues non-empty iff assertRunnable throws", () => {
    const refBad: WorkflowGraph = {
      parallel: true,
      nodes: [{ id: "a", kind: "agent", prompt: "x" }, { id: "b", kind: "agent", prompt: "{{steps.a.output}}" }],
      edges: [],
    };
    const cyc: WorkflowGraph = {
      parallel: true,
      nodes: [{ id: "a", kind: "agent", prompt: "x" }, { id: "b", kind: "agent", prompt: "x" }],
      edges: [{ from: "a", to: "b" }, { from: "b", to: "a" }],
    };
    const cases: WorkflowGraph[] = [parDiamond, refBad, cyc];
    for (const g of cases) {
      let threw = false;
      try {
        assertRunnable(g);
      } catch {
        threw = true;
      }
      expect(collectIssues(g).length > 0).toBe(threw);
    }
  });

  test("DRIFT GUARD: collectIssues is non-empty iff assertRunnable throws", () => {
    // Keeps the advisory collector and the hard gate from diverging without
    // forcing assertRunnable to change its (tested) Vietnamese messages.
    const cases: WorkflowGraph[] = [
      chain, // valid
      { nodes: [{ id: "x", kind: "agent", prompt: "" }], edges: [] }, // valid single
      {
        nodes: [
          { id: "a", kind: "agent", prompt: "" },
          { id: "b", kind: "agent", prompt: "" },
        ],
        edges: [],
      }, // multi_start (2 starts)
      {
        nodes: [
          { id: "a", kind: "agent", prompt: "" },
          { id: "b", kind: "agent", prompt: "" },
          { id: "c", kind: "agent", prompt: "" },
        ],
        edges: [
          { from: "a", to: "c" },
          { from: "b", to: "c" },
        ],
      }, // fan_in + multi_start
    ];
    for (const g of cases) {
      let threw = false;
      try {
        assertRunnable(g);
      } catch {
        threw = true;
      }
      expect(collectIssues(g).length > 0).toBe(threw);
    }
  });
});
