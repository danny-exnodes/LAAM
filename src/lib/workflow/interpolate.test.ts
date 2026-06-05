import { describe, expect, test } from "vitest";
import { resolveTemplate, interpolateArgs } from "./interpolate";
import { emptyContext } from "./types";

function ctxWith(output: unknown) {
  const c = emptyContext({ source: "manual" });
  c.steps["n1"] = { output };
  return c;
}

describe("resolveTemplate — PIN-D3a sole-token pass-through giữ TYPE", () => {
  test("sole-token number → number, KHÔNG phải string", () => {
    const c = ctxWith({ priority: 2 });
    expect(resolveTemplate("{{steps.n1.output.priority}}", c, "arg")).toBe(2);
  });
  test("sole-token array → array nguyên type", () => {
    const c = ctxWith({ tags: ["a", "b"] });
    expect(resolveTemplate("{{steps.n1.output.tags}}", c, "arg")).toEqual(["a", "b"]);
  });
  test("sole-token boolean → boolean", () => {
    const c = ctxWith({ done: false });
    expect(resolveTemplate("{{steps.n1.output.done}}", c, "arg")).toBe(false);
  });
});

describe("resolveTemplate — text sink TOTAL→string (CTO 06-05, kể cả sole-token)", () => {
  test("sole-token object + text → JSON.stringify (KHÔNG giữ type)", () => {
    const c = ctxWith({ tasks: [{ t: 1 }] });
    expect(resolveTemplate("{{steps.n1.output.tasks}}", c, "text")).toBe('[{"t":1}]');
  });
  test("sole-token number + text → '2' (string)", () => {
    const c = ctxWith({ priority: 2 });
    expect(resolveTemplate("{{steps.n1.output.priority}}", c, "text")).toBe("2");
  });
});

describe("resolveTemplate — embedded", () => {
  test("scalar embedded → coerce string", () => {
    const c = ctxWith({ number: 5, title: "Bug" });
    expect(resolveTemplate("Issue #{{steps.n1.output.number}}: {{steps.n1.output.title}}", c, "text"))
      .toBe("Issue #5: Bug");
  });
  test("object embedded + sink text → JSON.stringify", () => {
    const c = ctxWith({ tasks: [{ t: 1 }] });
    expect(resolveTemplate("Data: {{steps.n1.output.tasks}}", c, "text"))
      .toBe('Data: [{"t":1}]');
  });
  test("object embedded + sink arg → THROW (fail-loud)", () => {
    const c = ctxWith({ tasks: [{ t: 1 }] });
    expect(() => resolveTemplate("x {{steps.n1.output.tasks}}", c, "arg")).toThrow(/object/i);
  });
});

describe("resolveTemplate — PIN-D3b + missing", () => {
  test("KHÔNG bracket-index: items[0] không index, → missing", () => {
    const c = ctxWith({ items: [9] });
    expect(() => resolveTemplate("{{steps.n1.output.items[0]}}", c, "arg")).toThrow(/missing|không/i);
  });
  test("missing path + sink text → '' (warn)", () => {
    const c = ctxWith({});
    expect(resolveTemplate("[{{steps.n1.output.nope}}]", c, "text")).toBe("[]");
  });
});

describe("interpolateArgs — connector args deep", () => {
  test("giữ type number cho sole-token, coerce cho embedded", () => {
    const c = ctxWith({ priority: 3, id: "x9" });
    const out = interpolateArgs(
      { priority: "{{steps.n1.output.priority}}", title: "T-{{steps.n1.output.id}}", flag: true },
      c,
    );
    expect(out).toEqual({ priority: 3, title: "T-x9", flag: true });
  });
});
