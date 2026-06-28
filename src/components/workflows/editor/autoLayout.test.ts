import { describe, it, expect } from "vitest";
import { layoutPositions } from "./autoLayout";

describe("layoutPositions", () => {
  it("lays out a linear chain with monotonically increasing x and a single row", () => {
    // WHY: a linear workflow must read left→right; columns must advance per step
    // and stay on one row so the chain is legible (the common case).
    const nodes = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const edges = [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ];
    const pos = layoutPositions(nodes, edges, { xGap: 200, yGap: 100 });

    expect(pos.a.x).toBeLessThan(pos.b.x);
    expect(pos.b.x).toBeLessThan(pos.c.x);
    // each rank holds one node → all share the top row
    expect(pos.a.y).toBe(pos.b.y);
    expect(pos.b.y).toBe(pos.c.y);
  });

  it("separates a condition node's true/false branches onto distinct rows", () => {
    // WHY: the whole point of Tidy is that branches don't overlap — the two
    // children of a condition must be visually separated (different y), and
    // sit one column to the right of the condition.
    const nodes = [{ id: "cond" }, { id: "yes" }, { id: "no" }];
    const edges = [
      { from: "cond", to: "yes" },
      { from: "cond", to: "no" },
    ];
    const pos = layoutPositions(nodes, edges, { xGap: 200, yGap: 100 });

    expect(pos.yes.x).toBeGreaterThan(pos.cond.x);
    expect(pos.no.x).toBeGreaterThan(pos.cond.x);
    expect(pos.yes.y).not.toBe(pos.no.y); // branch separation
  });

  it("ranks by LONGEST path so a node never sits left of a predecessor", () => {
    // a→b→d and a→d : d must land after b (longest path), not next to b.
    const nodes = [{ id: "a" }, { id: "b" }, { id: "d" }];
    const edges = [
      { from: "a", to: "b" },
      { from: "b", to: "d" },
      { from: "a", to: "d" },
    ];
    const pos = layoutPositions(nodes, edges);
    expect(pos.d.x).toBeGreaterThan(pos.b.x);
  });

  it("gives every node a position even with dangling edges or cycles (never throws/loops)", () => {
    const nodes = [{ id: "x" }, { id: "y" }];
    const edges = [
      { from: "x", to: "y" },
      { from: "y", to: "x" }, // cycle
      { from: "x", to: "ghost" }, // dangling target ignored
    ];
    const pos = layoutPositions(nodes, edges);
    expect(Object.keys(pos).sort()).toEqual(["x", "y"]);
    expect(pos.ghost).toBeUndefined();
  });

  it("returns rounded integer coordinates", () => {
    const pos = layoutPositions([{ id: "a" }], [], { xGap: 33.7, yGap: 10 });
    expect(Number.isInteger(pos.a.x)).toBe(true);
    expect(Number.isInteger(pos.a.y)).toBe(true);
  });
});
