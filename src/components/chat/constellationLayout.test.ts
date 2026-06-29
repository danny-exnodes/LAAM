import { describe, it, expect } from "vitest";
import { layoutConstellation, INNER_RADIUS, OUTER_RADIUS } from "./constellationLayout";
import type { CatalogGroup } from "@/lib/chat/toolCatalog";

const grp = (id: string, type: CatalogGroup["type"], n = 1): CatalogGroup => ({
  id,
  type,
  label: id.toUpperCase(),
  tools: Array.from({ length: n }, (_, i) => ({ name: `${id}_t${i}`, description: "", kind: "read", args: [] })),
});

const radius = (x: number, y: number) => Math.sqrt(x * x + y * y);

describe("layoutConstellation", () => {
  it("returns [] for no agents and no groups", () => {
    expect(layoutConstellation([], [])).toEqual([]);
  });

  it("emits exactly agents.length + groups.length nodes", () => {
    const out = layoutConstellation([grp("gmail", "connector"), grp("daab", "mcp")], [
      { id: "a1", name: "Strategist" },
      { id: "a2", name: "Researcher" },
      { id: "a3", name: "Ops" },
    ]);
    expect(out).toHaveLength(5);
    expect(out.filter((n) => n.kind === "agent")).toHaveLength(3);
  });

  it("places agents on the inner ring and groups on the outer ring", () => {
    const out = layoutConstellation([grp("gmail", "connector")], [{ id: "a1", name: "Ops" }]);
    const agent = out.find((n) => n.kind === "agent")!;
    const group = out.find((n) => n.kind === "connector")!;
    expect(radius(agent.x, agent.y)).toBeCloseTo(INNER_RADIUS, 3);
    expect(radius(group.x, group.y)).toBeCloseTo(OUTER_RADIUS, 3);
  });

  it("spaces a ring evenly (constant angular delta between consecutive nodes)", () => {
    const agents = [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
      { id: "c", name: "C" },
      { id: "d", name: "D" },
    ];
    const angles = layoutConstellation([], agents).map((n) => n.angle);
    const deltas = angles.slice(1).map((a, i) => a - angles[i]);
    for (const d of deltas) expect(d).toBeCloseTo((2 * Math.PI) / 4, 6);
  });

  it("RULE 13: a group node's ref is the IDENTICAL source object, not a copy", () => {
    // If a refactor maps ref to a re-typed name string, click dispatch silently
    // breaks — this asserts the exact object round-trips untouched.
    const gmail = grp("gmail", "connector", 2);
    const [node] = layoutConstellation([gmail], []);
    expect("group" in node.ref && Object.is(node.ref.group, gmail)).toBe(true);
  });

  it("agent ref carries the agent id", () => {
    const [node] = layoutConstellation([], [{ id: "agent-xyz", name: "Researcher" }]);
    expect(node.ref).toEqual({ agentId: "agent-xyz" });
  });
});
