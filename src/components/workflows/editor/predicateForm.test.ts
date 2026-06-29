import { describe, it, expect } from "vitest";
import {
  PREDICATE_OPS,
  emptyComparator,
  isGroup,
  groupMode,
  groupChildren,
  getAt,
  setMode,
  setModeAt,
  addComparator,
  addGroup,
  removeBranch,
  updateComparator,
} from "./predicateForm";
import type { Predicate, Op } from "@/lib/workflow/types";

describe("predicateForm", () => {
  it("setMode wraps a lone comparator into a group, preserving it as the only child", () => {
    const cmp = { left: "{{a}}", op: "gt" as Op, right: "0" };
    const g = setMode(cmp, "all");
    expect(groupMode(g)).toBe("all");
    expect(groupChildren(g)).toEqual([cmp]);
  });

  it("setMode re-keys an existing group, keeping its children (all↔any)", () => {
    const g: Predicate = { all: [emptyComparator(), emptyComparator()] };
    const any = setMode(g, "any");
    expect(groupMode(any)).toBe("any");
    expect(groupChildren(any)).toHaveLength(2);
  });

  it("add/remove/update do NOT mutate the input (immutability)", () => {
    const root: Predicate = { all: [{ left: "x", op: "eq" as Op, right: "1" }] };
    const snapshot = JSON.stringify(root);

    const added = addComparator(root, []);
    const updated = updateComparator(added, [0], { left: "y" });
    const removed = removeBranch(updated, [1]);

    expect(JSON.stringify(root)).toBe(snapshot); // original untouched
    expect(groupChildren(added)).toHaveLength(2);
    expect((groupChildren(updated)[0] as { left: string }).left).toBe("y");
    expect(groupChildren(removed)).toHaveLength(1);
  });

  it("round-trips a nested all/any tree: build → edit a deep leaf → shape is exact", () => {
    // WHY: the builder must produce exactly the Predicate the engine evaluates,
    // including nested groups — a drift here means a condition silently changes.
    let p: Predicate = setMode(emptyComparator(), "all"); // { all: [cmp] }
    p = addGroup(p, [], "any"); // { all: [cmp, { any: [cmp] }] }
    p = updateComparator(p, [1, 0], { left: "{{steps.n1.output.count}}", op: "gte", right: "5" });

    expect(p).toEqual({
      all: [
        { left: "", op: "eq", right: "" },
        { any: [{ left: "{{steps.n1.output.count}}", op: "gte", right: "5" }] },
      ],
    });
    // and it survives a JSON serialize/parse round-trip (how it's persisted)
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
  });

  it("removeBranch on the root path is a no-op (root is never removable)", () => {
    const g: Predicate = { all: [emptyComparator()] };
    expect(removeBranch(g, [])).toEqual(g);
  });

  it("DRIFT GUARD: the offered op list matches the engine Op union exactly", () => {
    // If a new Op is added to types.ts, this list (and the UI built from it) must
    // be updated in lockstep, or the builder can emit an op the engine rejects.
    const engineOps: Op[] = [
      "eq",
      "ne",
      "gt",
      "lt",
      "gte",
      "lte",
      "contains",
      "not_contains",
      "exists",
      "not_exists",
    ];
    expect([...PREDICATE_OPS].sort()).toEqual([...engineOps].sort());
  });

  it("getAt navigates into nested groups and returns null for invalid paths", () => {
    const p: Predicate = { all: [emptyComparator(), { any: [{ left: "x", op: "eq" as Op, right: "1" }] }] };
    expect(getAt(p, [])).toBe(p);
    expect(getAt(p, [1, 0])).toEqual({ left: "x", op: "eq", right: "1" });
    expect(getAt(p, [9])).toBeNull(); // out of range
    expect(getAt(p, [0, 0])).toBeNull(); // into a comparator
  });

  it("setModeAt flips the mode of a NESTED group only", () => {
    const p: Predicate = { all: [emptyComparator(), { all: [emptyComparator()] }] };
    const out = setModeAt(p, [1], "any");
    expect(groupMode(out)).toBe("all"); // root unchanged
    expect(groupMode(groupChildren(out)[1])).toBe("any"); // nested flipped
  });

  it("isGroup distinguishes comparators from groups", () => {
    expect(isGroup({ left: "a", op: "eq" as Op, right: "b" })).toBe(false);
    expect(isGroup({ all: [] })).toBe(true);
    expect(isGroup({ any: [] })).toBe(true);
  });
});
