import { describe, expect, test } from "vitest";
import { trendLines } from "./TrendChart";
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
