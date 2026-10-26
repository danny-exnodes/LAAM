import { describe, it, expect } from "vitest";
import { placeNodes } from "./field";
import type { ConstNode } from "./nodeModel";
import type { CatalogGroup } from "@/lib/chat/toolCatalog";

const mk = (id: string, ring: "inner" | "outer"): ConstNode => ({ id, label: id, ring, state: "linked", ref: { kind: "agent", agentId: id } });

describe("placeNodes", () => {
  it("keeps inner nodes closer to the origin than outer nodes", () => {
    const placed = placeNodes([mk("a", "inner"), mk("b", "outer")]);
    const r = (n: { x: number; y: number }) => Math.hypot(n.x, n.y);
    expect(r(placed.find(p => p.id === "a")!)).toBeLessThan(r(placed.find(p => p.id === "b")!));
  });

  it("spaces a ring evenly (constant angular delta) and is deterministic", () => {
    const placed = placeNodes([mk("a", "outer"), mk("b", "outer"), mk("c", "outer")]);
    const angs = placed.map(p => Math.atan2(p.y, p.x));
    const d1 = angs[1] - angs[0], d2 = angs[2] - angs[1];
    expect(Math.abs(d1 - d2)).toBeLessThan(1e-6);
    expect(placeNodes([mk("a", "outer")])[0]).toEqual(placeNodes([mk("a", "outer")])[0]);
  });

  it("places a single outer node at the -90° start angle (concrete, deterministic)", () => {
    const [p] = placeNodes([mk("a", "outer")]);
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(-40, 6); // OUTER radius, sin(-π/2) = -1
  });

  it("handles empty and single-node rings without throwing and yields finite coords", () => {
    expect(() => placeNodes([])).not.toThrow();
    const [only] = placeNodes([mk("solo", "inner")]);
    expect(Number.isFinite(only.x) && Number.isFinite(only.y)).toBe(true);
  });

  it("preserves the source group reference through layout (Rule 13 end-to-end)", () => {
    const group: CatalogGroup = { id: "connector:x", type: "connector", label: "X", tools: [] };
    const node = { id: "group:x", label: "X", ring: "outer", state: "linked", ref: { kind: "tool", group } } as const;
    const [placed] = placeNodes([node as unknown as ConstNode]);
    expect(placed.ref.kind === "tool" && placed.ref.group).toBe(group); // identical reference, not a copy
  });
});
