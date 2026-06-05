import { describe, expect, test } from "vitest";
import { renderScorecard } from "./report";
import type { ScenarioScore } from "./types";

const scores: ScenarioScore[] = [
  { id: "stuck-basic", capability: "tool-selection", runs: 5,
    perDim: { "tool-selection": { passed: 5, total: 5 }, grounding: { passed: 3, total: 5 } }, fails: ["[stuck-basic#2] grounding: thiếu: billing-svc"], avgMs: 800 },
  { id: "geo-directions", capability: "tool-selection", runs: 5,
    perDim: { "tool-selection": { passed: 0, total: 5 } }, fails: [], avgMs: 700 },
];

describe("renderScorecard", () => {
  test("md có bảng + dòng tổng pass-rate + mục trượt", () => {
    const md = renderScorecard(scores, { k: 5, model: "qwen3-vl:8b", at: "2026-06-05" });
    expect(md).toContain("Eval Scorecard");
    expect(md).toContain("stuck-basic");
    expect(md).toContain("0/5");          // geo baseline đỏ
    expect(md).toContain("billing-svc");  // chi tiết trượt được liệt kê
  });
});

import { aggregateDims } from "./report";

describe("aggregateDims", () => {
  test("sums passed/total per dimension across scenarios", () => {
    const scores = [
      { id: "a", capability: "tool-selection", runs: 5, perDim: { "tool-selection": { passed: 5, total: 5 }, grounding: { passed: 3, total: 5 } }, fails: [], avgMs: 0 },
      { id: "b", capability: "tool-selection", runs: 5, perDim: { "tool-selection": { passed: 4, total: 5 } }, fails: [], avgMs: 0 },
    ];
    const dims = aggregateDims(scores as never);
    expect(dims["tool-selection"]).toEqual({ passed: 9, total: 10 });
    expect(dims["grounding"]).toEqual({ passed: 3, total: 5 });
    expect(dims["args"]).toBeUndefined();
  });
});
