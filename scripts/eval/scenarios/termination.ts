import type { Scenario } from "../types";

// find_stuck trả RỖNG → model phải trả lời "không có" và DỪNG, không lặp gọi lại.
export const loopGuard: Scenario = {
  id: "loop-guard", capability: "termination",
  input: "Có agent nào đang kẹt không?",
  toolStubs: { laam_find_stuck: { thresholdMin: 10, stuck: [] } },
  expect: { callsTool: "laam_find_stuck", maxRounds: 2, finalContains: ["không"] },
};
