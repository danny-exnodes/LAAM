import { describe, it, expect } from "vitest";
import { looseJsonParse } from "./loose-json";

describe("looseJsonParse (tolerant chart/map JSON — S5)", () => {
  it("parses valid JSON", () => {
    expect(looseJsonParse('{"a":1}')).toEqual({ a: 1 });
  });
  it("tolerates trailing commas (a common model slip)", () => {
    expect(looseJsonParse('{"a":1,"b":[2,3,],}')).toEqual({ a: 1, b: [2, 3] });
  });
  it("tolerates curly/smart double-quotes", () => {
    expect(looseJsonParse("{“type”:“bar”}")).toEqual({ type: "bar" });
  });
  it("strips a stray code fence the model left in", () => {
    expect(looseJsonParse('```json\n{"x":5}\n```')).toEqual({ x: 5 });
  });
  it("returns null for unrecoverable garbage", () => {
    expect(looseJsonParse("{not json at all")).toBeNull();
  });
  it("returns null for non-strings", () => {
    expect(looseJsonParse(123 as unknown as string)).toBeNull();
  });
});
