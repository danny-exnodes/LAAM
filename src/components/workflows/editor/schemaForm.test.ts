import { describe, expect, test } from "vitest";
import { parseArgSchema } from "./schemaForm";

describe("parseArgSchema", () => {
  test("flat object → one field per property, typed", () => {
    const { fields, flat, propCount } = parseArgSchema({
      type: "object",
      properties: {
        title: { type: "string", description: "Card title" },
        count: { type: "number" },
        done: { type: "boolean" },
      },
    });
    expect(flat).toBe(true);
    expect(propCount).toBe(3);
    expect(fields).toEqual([
      { key: "title", kind: "string", description: "Card title", required: false, enumValues: undefined },
      { key: "count", kind: "number", description: undefined, required: false, enumValues: undefined },
      { key: "done", kind: "boolean", description: undefined, required: false, enumValues: undefined },
    ]);
  });

  test("integer maps to number", () => {
    const { fields } = parseArgSchema({ type: "object", properties: { n: { type: "integer" } } });
    expect(fields[0].kind).toBe("number");
  });

  test("enum → enum kind with string values (takes precedence over type)", () => {
    const { fields } = parseArgSchema({
      type: "object",
      properties: { status: { type: "string", enum: ["todo", "doing", "done"] } },
    });
    expect(fields[0].kind).toBe("enum");
    expect(fields[0].enumValues).toEqual(["todo", "doing", "done"]);
  });

  test("required array marks fields", () => {
    const { fields } = parseArgSchema({
      type: "object",
      properties: { a: { type: "string" }, b: { type: "string" } },
      required: ["b"],
    });
    expect(fields.find((f) => f.key === "a")!.required).toBe(false);
    expect(fields.find((f) => f.key === "b")!.required).toBe(true);
  });

  test("nested object/array property → skipped, flat=false (but other fields kept)", () => {
    const { fields, flat, propCount } = parseArgSchema({
      type: "object",
      properties: {
        name: { type: "string" },
        tags: { type: "array" },
        meta: { type: "object" },
      },
    });
    expect(propCount).toBe(3);
    expect(fields.map((f) => f.key)).toEqual(["name"]); // only the scalar survives
    expect(flat).toBe(false); // some props weren't renderable
  });

  test("empty properties → propCount 0, flat false (no-args tool)", () => {
    expect(parseArgSchema({ type: "object", properties: {} })).toEqual({ fields: [], propCount: 0, flat: false });
  });

  test("non-object / null / garbage → empty + flat false", () => {
    expect(parseArgSchema(null)).toEqual({ fields: [], propCount: 0, flat: false });
    expect(parseArgSchema({})).toEqual({ fields: [], propCount: 0, flat: false });
    expect(parseArgSchema({ type: "string" })).toEqual({ fields: [], propCount: 0, flat: false });
    expect(parseArgSchema("nope")).toEqual({ fields: [], propCount: 0, flat: false });
  });
});
