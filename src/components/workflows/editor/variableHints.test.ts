import { describe, expect, test } from "vitest";
import { variableSuggestions } from "./variableHints";
import type { WfNode } from "@/lib/workflow/types";

const nodes: WfNode[] = [
  { id: "a", kind: "agent", prompt: "" },
  { id: "b", kind: "connector", connectorId: "", action: "", args: {} },
  { id: "c", kind: "condition", when: { left: "", op: "eq", right: "" } },
];

describe("variableSuggestions", () => {
  test("trigger + each sibling's output, excludes self", () => {
    expect(variableSuggestions(nodes, "b")).toEqual([
      "{{trigger}}",
      "{{steps.a.output}}",
      "{{steps.c.output}}",
    ]);
  });

  test("only trigger when the node is alone", () => {
    expect(variableSuggestions([nodes[0]], "a")).toEqual(["{{trigger}}"]);
  });

  test("empty graph → just trigger", () => {
    expect(variableSuggestions([], "x")).toEqual(["{{trigger}}"]);
  });
});
