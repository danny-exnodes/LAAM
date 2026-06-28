import { describe, it, expect } from "vitest";
import { previewOutput, OUTPUT_PREVIEW_MAX } from "./outputPreview";

describe("previewOutput", () => {
  it("returns '' for null/undefined", () => {
    expect(previewOutput(null)).toBe("");
    expect(previewOutput(undefined)).toBe("");
  });

  it("passes a short string through, trimmed", () => {
    expect(previewOutput("  hello  ")).toBe("hello");
  });

  it("JSON-stringifies objects/arrays (code-derived, not LLM-described)", () => {
    expect(previewOutput({ a: 1, b: "x" })).toBe('{"a":1,"b":"x"}');
    expect(previewOutput([1, 2, 3])).toBe("[1,2,3]");
  });

  it("truncates to the max with an ellipsis", () => {
    const long = "a".repeat(500);
    const out = previewOutput(long, 50);
    expect(out).toHaveLength(50);
    expect(out.endsWith("…")).toBe(true);
  });

  it("defaults to OUTPUT_PREVIEW_MAX", () => {
    const out = previewOutput("b".repeat(1000));
    expect(out).toHaveLength(OUTPUT_PREVIEW_MAX);
  });
});
