import type { Scenario } from "../types";

// Dùng tool tính chính xác thay vì nhẩm. Stub trả kết quả ĐÚNG → chấm model có RELAY không.
export const utilCalcSum: Scenario = {
  id: "util-calc-sum", capability: "tool-selection",
  input: "Cộng chi phí 3 agent: 0.42 + 1.15 + 0.08 USD, ra bao nhiêu?",
  toolStubs: { util_calc: { expr: "0.42 + 1.15 + 0.08", result: 1.65 } },
  expect: {
    callsTool: "util_calc",
    args: { util_calc: (a) => typeof a.expr === "string" && /0\.42/.test(a.expr as string) },
    finalContains: ["1.65"], notCalls: ["web_search"], maxRounds: 2,
  },
};
