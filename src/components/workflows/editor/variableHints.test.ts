import { describe, expect, test } from "vitest";
import { variableSuggestions } from "./variableHints";
import type { WfNode } from "@/lib/workflow/types";

const nodes: WfNode[] = [
  { id: "a", kind: "agent", prompt: "" },
  { id: "b", kind: "connector", connectorId: "", action: "", args: {} },
  { id: "c", kind: "condition", when: { left: "", op: "eq", right: "" } },
];
// Linear flow a → b → c
const linear = [{ source: "a", target: "b" }, { source: "b", target: "c" }];

describe("variableSuggestions (flow-aware, upstream-only)", () => {
  test("suggests trigger + UPSTREAM ancestors only (in node order)", () => {
    // c's ancestors = a, b
    expect(variableSuggestions(nodes, linear, "c")).toEqual([
      "{{trigger}}",
      "{{steps.a.output}}",
      "{{steps.b.output}}",
    ]);
  });

  test("start node sees only trigger (nothing upstream; downstream excluded)", () => {
    expect(variableSuggestions(nodes, linear, "a")).toEqual(["{{trigger}}"]);
  });

  test("middle node sees only its upstream, not downstream", () => {
    expect(variableSuggestions(nodes, linear, "b")).toEqual(["{{trigger}}", "{{steps.a.output}}"]);
  });

  test("no edges → only trigger (nothing is upstream)", () => {
    expect(variableSuggestions(nodes, [], "b")).toEqual(["{{trigger}}"]);
  });

  test("branches: each arm sees the condition + its ancestors, not the sibling arm", () => {
    const brNodes: WfNode[] = [
      { id: "a", kind: "agent", prompt: "" },
      { id: "cond", kind: "condition", when: { left: "", op: "eq", right: "" } },
      { id: "t", kind: "agent", prompt: "" },
      { id: "f", kind: "agent", prompt: "" },
    ];
    const brEdges = [
      { source: "a", target: "cond" },
      { source: "cond", target: "t" },
      { source: "cond", target: "f" },
    ];
    expect(variableSuggestions(brNodes, brEdges, "t")).toEqual([
      "{{trigger}}",
      "{{steps.a.output}}",
      "{{steps.cond.output}}",
    ]);
    // sibling arm "t" is NOT upstream of "f"
    expect(variableSuggestions(brNodes, brEdges, "f")).not.toContain("{{steps.t.output}}");
  });
});
