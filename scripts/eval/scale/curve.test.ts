import { describe, expect, test } from "vitest";
import { wilson, curveTable, type CurvePoint } from "./curve";

describe("wilson (95% CI)", () => {
  test("5/5 → cận trên = 1, cận dưới ∈ (0.5, 1)", () => {
    const [lo, hi] = wilson(5, 5);
    expect(hi).toBeCloseTo(1, 5);
    expect(lo).toBeGreaterThan(0.5);
    expect(lo).toBeLessThan(1);
  });
  test("0/5 → cận dưới = 0, cận trên < 0.6", () => {
    const [lo, hi] = wilson(0, 5);
    expect(lo).toBe(0);
    expect(hi).toBeLessThan(0.6);
  });
});

describe("curveTable", () => {
  test("markdown probe × N với pass-rate + avg", () => {
    const pts: CurvePoint[] = [
      { probe: "stuck", n: 8, passed: 5, total: 5 }, { probe: "stuck", n: 40, passed: 3, total: 5 },
    ];
    const md = curveTable(pts, [8, 40]);
    expect(md).toContain("| stuck |");
    expect(md).toContain("100%");
    expect(md).toContain("60%");
    expect(md).toContain("avg");
  });

  test("dòng no-call riêng cho probe có noCall (Nit 1: tách no-call vs wrong-call)", () => {
    const pts: CurvePoint[] = [
      { probe: "write", n: 8, passed: 2, total: 5, noCall: 3 },
      { probe: "write", n: 40, passed: 0, total: 5, noCall: 5 },
    ];
    const md = curveTable(pts, [8, 40]);
    expect(md).toContain("no-call");
    expect(md).toContain("write:");
    expect(md).toContain("40→5/5");
  });
});
