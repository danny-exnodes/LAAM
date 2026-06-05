import { describe, expect, test, vi } from "vitest";
import { buildEvalRow } from "./persist-run";

describe("buildEvalRow", () => {
  test("maps meta+scores to an eval_run row (dims aggregated, totals computed)", () => {
    const scores = [
      { id: "a", capability: "tool-selection", runs: 5, perDim: { "tool-selection": { passed: 5, total: 5 } }, fails: [], avgMs: 10 },
      { id: "b", capability: "args", runs: 5, perDim: { args: { passed: 4, total: 5 } }, fails: ["x"], avgMs: 20 },
    ];
    const row = buildEvalRow({ k: 5, model: "qwen3", at: "2026-06-05" }, scores as never, { label: "step1", gitSha: "abc123" });
    expect(row.model).toBe("qwen3");
    expect(row.k).toBe(5);
    expect(row.label).toBe("step1");
    expect(row.gitSha).toBe("abc123");
    expect(row.totalScenarios).toBe(2);
    expect(row.totalRuns).toBe(10); // 2 scenarios * k=5
    expect(row.dims["tool-selection"]).toEqual({ passed: 5, total: 5 });
    expect(row.dims["args"]).toEqual({ passed: 4, total: 5 });
    expect(row.scores).toHaveLength(2);
  });
});
