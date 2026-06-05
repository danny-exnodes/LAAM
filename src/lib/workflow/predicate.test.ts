import { describe, expect, test } from "vitest";
import { evalPredicate } from "./predicate";
import { emptyContext } from "./types";

const ctx = (o: unknown) => { const c = emptyContext({}); c.steps["a"] = { output: o }; return c; };

describe("evalPredicate", () => {
  test("gt numeric", () => expect(evalPredicate({ left: "{{steps.a.output.n}}", op: "gt", right: 5 }, ctx({ n: 9 }))).toBe(true));
  test("gt numeric false", () => expect(evalPredicate({ left: "{{steps.a.output.n}}", op: "gt", right: 5 }, ctx({ n: 1 }))).toBe(false));
  test("eq string", () => expect(evalPredicate({ left: "{{steps.a.output.s}}", op: "eq", right: "bug" }, ctx({ s: "bug" }))).toBe(true));
  test("ne string", () => expect(evalPredicate({ left: "{{steps.a.output.s}}", op: "ne", right: "bug" }, ctx({ s: "feat" }))).toBe(true));
  test("eq deep array", () => expect(evalPredicate({ left: "{{steps.a.output.xs}}", op: "eq", right: [1, 2] }, ctx({ xs: [1, 2] }))).toBe(true));
  test("eq deep object", () => expect(evalPredicate({ left: "{{steps.a.output.o}}", op: "eq", right: { k: 1 } }, ctx({ o: { k: 1 } }))).toBe(true));
  test("lte boundary", () => expect(evalPredicate({ left: "{{steps.a.output.n}}", op: "lte", right: 5 }, ctx({ n: 5 }))).toBe(true));
  test("gte boundary", () => expect(evalPredicate({ left: "{{steps.a.output.n}}", op: "gte", right: 5 }, ctx({ n: 5 }))).toBe(true));
  test("lt numeric", () => expect(evalPredicate({ left: "{{steps.a.output.n}}", op: "lt", right: 5 }, ctx({ n: 3 }))).toBe(true));
  test("contains array membership", () => expect(evalPredicate({ left: "{{steps.a.output.tags}}", op: "contains", right: "x" }, ctx({ tags: ["x", "y"] }))).toBe(true));
  test("contains string substring", () => expect(evalPredicate({ left: "{{steps.a.output.t}}", op: "contains", right: "ug" }, ctx({ t: "bug" }))).toBe(true));
  test("not_contains array", () => expect(evalPredicate({ left: "{{steps.a.output.tags}}", op: "not_contains", right: "z" }, ctx({ tags: ["x", "y"] }))).toBe(true));
  test("exists (value 0 is present)", () => expect(evalPredicate({ left: "{{steps.a.output.maybe}}", op: "exists" }, ctx({ maybe: 0 }))).toBe(true));
  test("exists on missing → false", () => expect(evalPredicate({ left: "{{steps.a.output.nope}}", op: "exists" }, ctx({}))).toBe(false));
  test("not_exists on missing → true", () => expect(evalPredicate({ left: "{{steps.a.output.nope}}", op: "not_exists" }, ctx({}))).toBe(true));
  test("not_exists on present → false", () => expect(evalPredicate({ left: "{{steps.a.output.maybe}}", op: "not_exists" }, ctx({ maybe: 0 }))).toBe(false));
  test("all = AND", () => expect(evalPredicate({ all: [{ left: "{{steps.a.output.n}}", op: "gt", right: 1 }, { left: "{{steps.a.output.n}}", op: "lt", right: 10 }] }, ctx({ n: 5 }))).toBe(true));
  test("all = AND (one false → false)", () => expect(evalPredicate({ all: [{ left: "{{steps.a.output.n}}", op: "gt", right: 1 }, { left: "{{steps.a.output.n}}", op: "gt", right: 10 }] }, ctx({ n: 5 }))).toBe(false));
  test("any = OR", () => expect(evalPredicate({ any: [{ left: "{{steps.a.output.n}}", op: "eq", right: 1 }, { left: "{{steps.a.output.n}}", op: "eq", right: 5 }] }, ctx({ n: 5 }))).toBe(true));
  test("any = OR (all false → false)", () => expect(evalPredicate({ any: [{ left: "{{steps.a.output.n}}", op: "eq", right: 1 }, { left: "{{steps.a.output.n}}", op: "eq", right: 2 }] }, ctx({ n: 5 }))).toBe(false));
  test("right as template", () => expect(evalPredicate({ left: "{{steps.a.output.x}}", op: "eq", right: "{{steps.a.output.y}}" }, ctx({ x: 3, y: 3 }))).toBe(true));
  test("comparator op on missing left (non-exists) → throws (fail-loud)", () =>
    expect(() => evalPredicate({ left: "{{steps.a.output.nope}}", op: "gt", right: 1 }, ctx({}))).toThrow(/missing/i));
});
