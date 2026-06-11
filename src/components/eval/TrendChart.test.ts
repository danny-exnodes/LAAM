import { describe, expect, test } from "vitest";
import { dimColors, lineStroke, trendLines } from "./TrendChart";
import { DARK, LIGHT } from "@/hooks/useChartTheme";
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
    expect(lineStroke("overall", "#f5f5f5", dimColors(DARK.series))).toBe("#f5f5f5"); // dark theme → light stroke
    expect(lineStroke("overall", "#111827", dimColors(LIGHT.series))).toBe("#111827"); // light theme → dark stroke
  });

  // QA W5 residual ②: the cyan dims were hardcoded #36a6d6/#0ea5e9 — only
  // 2.77:1 on the white light-mode card (WCAG 1.4.11 needs 3:1). They must
  // resolve through the ACTIVE theme series palette (light = darkened cyans).
  test("cyan dimensions follow the theme series palette", () => {
    expect(lineStroke("tool-selection", "#111827", dimColors(LIGHT.series))).toBe(LIGHT.series.accent);
    expect(lineStroke("args", "#111827", dimColors(LIGHT.series))).toBe(LIGHT.series.sky);
    expect(lineStroke("tool-selection", "#f5f5f5", dimColors(DARK.series))).toBe("#36a6d6"); // dark keeps brand cyan
  });

  test("non-cyan dimensions keep fixed hues regardless of theme; unknown dims fall back to gray", () => {
    expect(lineStroke("grounding", "#111827", dimColors(LIGHT.series))).toBe("#22c55e");
    expect(lineStroke("grounding", "#f5f5f5", dimColors(DARK.series))).toBe("#22c55e");
    expect(lineStroke("not-a-dim", "#f5f5f5", dimColors(DARK.series))).toBe("#888");
  });
});
