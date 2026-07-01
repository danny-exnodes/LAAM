import { describe, it, expect } from "vitest";
import { placeNodes } from "./field";
import type { ConstNode } from "./nodeModel";

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
});
