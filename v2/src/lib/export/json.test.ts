import { describe, it, expect } from "vitest";
import { toJson } from "./json";

describe("toJson", () => {
  it("pretty-prints with 2-space indent", () => {
    expect(toJson({ a: 1 })).toBe('{\n  "a": 1\n}');
  });

  it("serializes arrays and nested objects", () => {
    expect(toJson([{ b: [1, 2] }])).toContain('"b": [');
  });

  it("returns {} for values JSON cannot serialize", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(toJson(circular)).toBe("{}");
  });
});
