import { describe, expect, test } from "vitest";
import { overallOf, buildEvalDashboard } from "./eval-stats";
import type { EvalRun } from "@/db/schema";

const mkRun = (over: Partial<EvalRun>): EvalRun => ({
  id: "r", ranAt: new Date("2026-06-05T10:00:00Z"), model: "qwen3", k: 5,
  label: null, gitSha: null, totalScenarios: 2, totalRuns: 10,
  dims: { "tool-selection": { passed: 8, total: 10 }, args: { passed: 10, total: 10 } },
  scores: [], createdAt: new Date(), ...over,
});

describe("overallOf", () => {
  test("total passed / total graded across dims", () => {
    expect(overallOf({ a: { passed: 8, total: 10 }, b: { passed: 10, total: 10 } })).toBe(90);
  });
  test("0 graded → 0", () => expect(overallOf({})).toBe(0));
});

describe("buildEvalDashboard", () => {
  test("empty → null headline/latest, empty trend/runs", () => {
    const d = buildEvalDashboard([]);
    expect(d.headline).toBeNull();
    expect(d.latest).toBeNull();
    expect(d.trend).toEqual([]);
  });
  test("headline = latest overall + delta vs previous; trend is ASC", () => {
    // rows are DESC by ranAt (newest first), as the page queries them
    const newer = mkRun({ id: "new", ranAt: new Date("2026-06-05T12:00:00Z"), label: "step2", dims: { a: { passed: 10, total: 10 } } }); // 100%
    const older = mkRun({ id: "old", ranAt: new Date("2026-06-05T09:00:00Z"), label: "step1", dims: { a: { passed: 8, total: 10 } } }); // 80%
    const d = buildEvalDashboard([newer, older]);
    expect(d.headline!.overallPct).toBe(100);
    expect(d.headline!.deltaVsPrev).toBe(20); // 100 - 80
    expect(d.headline!.label).toBe("step2");
    expect(d.trend.map((p) => p.run)).toEqual(["step1", "step2"]); // ASC, label preferred
    expect(d.latest!.dims).toEqual(newer.dims);
    expect(d.runs.map((r) => r.id)).toEqual(["new", "old"]); // DESC
  });
});
