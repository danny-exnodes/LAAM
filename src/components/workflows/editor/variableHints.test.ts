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

  test("expands an upstream agent's format-schema top-level fields (code-derived)", () => {
    // WHY: the engine resolves {{steps.x.output.field}} for a structured-output
    // agent; the picker must offer those exact fields (read from node.format, not
    // guessed) so authors don't hand-type dotted paths.
    const nodes: WfNode[] = [
      { id: "a", kind: "agent", prompt: "", format: { type: "object", properties: { count: {}, title: {} } } },
      { id: "b", kind: "agent", prompt: "" },
    ];
    const edges = [{ source: "a", target: "b" }];
    const sug = variableSuggestions(nodes, edges, "b");
    expect(sug).toContain("{{steps.a.output}}");
    expect(sug).toContain("{{steps.a.output.count}}");
    expect(sug).toContain("{{steps.a.output.title}}");
  });

  test("offers {{item}} and {{index}} only when editing inside a foreach body", () => {
    const nodes: WfNode[] = [{ id: "s", kind: "agent", prompt: "" }];
    expect(variableSuggestions(nodes, [], "s")).not.toContain("{{item}}");
    const inBody = variableSuggestions(nodes, [], "s", { inForeachBody: true });
    expect(inBody).toContain("{{item}}");
    expect(inBody).toContain("{{index}}");
  });

  test("ignores a non-object/array format (no crash, no bogus fields)", () => {
    const nodes: WfNode[] = [
      { id: "a", kind: "agent", prompt: "", format: { type: "string" } },
      { id: "b", kind: "agent", prompt: "" },
    ];
    const sug = variableSuggestions(nodes, [{ source: "a", target: "b" }], "b");
    expect(sug).toEqual(["{{trigger}}", "{{steps.a.output}}"]);
  });
});
