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
