import { describe, expect, test } from "vitest";
import { lineStroke, trendLines } from "./TrendChart";
import type { TrendPoint } from "@/lib/eval-stats";

describe("trendLines", () => {
  test("returns one series key per dimension present + overall, skipping all-null dims", () => {
    const trend: TrendPoint[] = [
      { run: "s1", overall: 80, perDim: { "tool-selection": 80, args: null, grounding: 60 } },
      { run: "s2", overall: 100, perDim: { "tool-selection": 100, args: null, grounding: 100 } },
    ];
    const keys = trendLines(trend);
    expect(keys).toContain("overall");
    expect(keys).toContain("tool-selection");
    expect(keys).toContain("grounding");
    expect(keys).not.toContain("args"); // all null → skipped
  });
});

describe("lineStroke", () => {
  // QA A3: "overall" was hardcoded #111827 and vanished on the dark card bg.
  // It must follow the ACTIVE chart theme, never a fixed color.
  test("overall line takes its stroke from the chart theme", () => {
    expect(lineStroke("overall", "#f5f5f5")).toBe("#f5f5f5"); // dark theme → light stroke
    expect(lineStroke("overall", "#111827")).toBe("#111827"); // light theme → dark stroke
  });

  test("dimension lines keep fixed hues regardless of theme; unknown dims fall back to gray", () => {
    expect(lineStroke("tool-selection", "#f5f5f5")).toBe("#36a6d6");
    expect(lineStroke("not-a-dim", "#f5f5f5")).toBe("#888");
  });
});
