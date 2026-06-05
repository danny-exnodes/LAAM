import { describe, expect, test, vi } from "vitest";
import { runScenario } from "./runner";
import type { Scenario } from "./types";

// Fake Ollama: chưa thấy kết quả tool trong convo → gọi tool; đã thấy → ra text.
// NB: runScenario gọi callOllama k lần (mỗi run mới convo riêng) + buildTools:()=>[]
// nên KHÔNG gate theo tools.length (luôn 0) hay đếm-lượt toàn cục (state rò qua các run).
// Gate theo input (có role:"tool" chưa) → mỗi run hành xử giống hệt, không rò state.
function fakeOllama() {
  return vi.fn(async (msgs: { role: string }[]) => {
    const sawToolResult = Array.isArray(msgs) && msgs.some((m) => m.role === "tool");
    if (!sawToolResult) {
      return { message: { content: "", tool_calls: [{ function: { name: "laam_find_stuck", arguments: { thresholdMin: 10 } } }] } };
    }
    return { message: { content: "Project billing-svc đang kẹt." } };
  });
}

const scenario: Scenario = {
  id: "stuck-basic", capability: "tool-selection", input: "Agent nào kẹt?",
  toolStubs: { laam_find_stuck: { stuck: [{ project: "billing-svc" }] } },
  expect: { callsTool: "laam_find_stuck", notCalls: ["laam_query_stats"], finalContains: ["billing-svc"], maxRounds: 2 },
};

describe("runScenario", () => {
  test("chạy k lần, gom pass-rate từng chiều", async () => {
    const score = await runScenario(scenario, { callOllama: fakeOllama(), buildTools: () => [] }, 3);
    expect(score.runs).toBe(3);
    expect(score.perDim["tool-selection"]).toEqual({ passed: 3, total: 3 });
    expect(score.perDim["grounding"]).toEqual({ passed: 3, total: 3 });
    expect(score.perDim["termination"].passed).toBe(3);
  });

  test("một lần lỗi callOllama → run đó tính fail mọi chiều, KHÔNG ném", async () => {
    const flaky = vi.fn().mockRejectedValueOnce(new Error("Ollama 500"))
      .mockResolvedValue({ message: { content: "Project billing-svc đang kẹt." } });
    const score = await runScenario(scenario, { callOllama: flaky, buildTools: () => [] }, 1);
    expect(score.runs).toBe(1);
    expect(score.perDim["tool-selection"].passed).toBe(0);
    expect(score.fails.length).toBeGreaterThan(0);
  });
});
