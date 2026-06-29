import { describe, it, expect } from "vitest";
import { nodeOutputRef } from "./outputRef";
import type { WfNode } from "@/lib/workflow/types";

describe("nodeOutputRef", () => {
  it("gives a {{steps.<id>.output}} ref for output-producing kinds", () => {
    const cases: WfNode[] = [
      { id: "a1", kind: "agent", prompt: "" },
      { id: "c1", kind: "connector", connectorId: "demo", action: "x", args: {} },
      { id: "m1", kind: "mcp", server: "s", tool: "t", args: {} },
      { id: "f1", kind: "foreach", items: "{{x}}", body: { nodes: [], edges: [] } },
    ];
    for (const n of cases) expect(nodeOutputRef(n)).toBe(`{{steps.${n.id}.output}}`);
  });

  it("returns null for a condition node (it branches, no consumable output)", () => {
    expect(nodeOutputRef({ id: "cond", kind: "condition", when: { left: "", op: "eq", right: "" } })).toBeNull();
  });
});
