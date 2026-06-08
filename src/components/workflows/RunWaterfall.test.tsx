import { describe, expect, test } from "vitest";
import { waterfallLayout, fmtMs } from "./RunWaterfall";

// minimal timed-step factory (only the fields waterfallLayout reads)
const step = (nodeId: string, seq: number, startMs: number | null, endMs: number | null) =>
  ({
    nodeId,
    status: "succeeded",
    seq,
    startedAt: startMs == null ? null : new Date(startMs),
    finishedAt: endMs == null ? null : new Date(endMs),
  }) as Parameters<typeof waterfallLayout>[0][number];

describe("waterfallLayout", () => {
  test("offsets + widths as % of the run span, sorted by seq", () => {
    // run 1000ms: s1 [0..200ms], s2 [200..1000ms]; given out of order
    const { bars, totalMs } = waterfallLayout(
      [step("s2", 1, 1200, 2000), step("s1", 0, 1000, 1200)],
      new Date(1000),
      new Date(2000),
    );
    expect(totalMs).toBe(1000);
    expect(bars.map((b) => b.nodeId)).toEqual(["s1", "s2"]); // sorted by seq
    expect(bars[0]).toMatchObject({ nodeId: "s1", offsetPct: 0, durationMs: 200 });
    expect(bars[0].widthPct).toBeCloseTo(20, 5);
    expect(bars[1].offsetPct).toBeCloseTo(20, 5);
    expect(bars[1].widthPct).toBeCloseTo(80, 5);
    expect(bars[1].durationMs).toBe(800);
  });

  test("a running step (no finishedAt) extends to the run end", () => {
    const { bars } = waterfallLayout([step("s1", 0, 1000, null)], new Date(1000), new Date(1500));
    expect(bars[0].durationMs).toBe(500);
    expect(bars[0].widthPct).toBeCloseTo(100, 5);
  });

  test("skips steps that have not started", () => {
    const { bars } = waterfallLayout(
      [step("s1", 0, 1000, 1200), step("s2", 1, null, null)],
      new Date(1000),
      new Date(1200),
    );
    expect(bars.map((b) => b.nodeId)).toEqual(["s1"]);
  });

  test("derives the span from steps when run start/end are null", () => {
    const { totalMs, bars } = waterfallLayout(
      [step("s1", 0, 1000, 1200), step("s2", 1, 1200, 1500)],
      null,
      null,
    );
    expect(totalMs).toBe(500); // 1500 − 1000
    expect(bars).toHaveLength(2);
  });

  test("guards divide-by-zero (zero span → totalMs 1, width clamped to a visible min)", () => {
    const { totalMs, bars } = waterfallLayout([step("s1", 0, 1000, 1000)], new Date(1000), new Date(1000));
    expect(totalMs).toBe(1);
    expect(bars[0].widthPct).toBeGreaterThanOrEqual(1.5);
  });
});

describe("fmtMs", () => {
  test("formats sub-second as ms, seconds with precision", () => {
    expect(fmtMs(230)).toBe("230ms");
    expect(fmtMs(1200)).toBe("1.20s");
    expect(fmtMs(15000)).toBe("15.0s");
  });
});
