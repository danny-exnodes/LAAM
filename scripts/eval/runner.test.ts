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

  // WHY: eval-scale ban đầu KHÔNG bao giờ truyền mode → không đo được VOICE_GUIDE, đúng
  // thứ đã xác định là gây dừng tra cứu sớm trên production (xem CHANGELOG). Runner phải
  // xuyên `s.mode` xuống buildSystemPrompt để một Scenario voice đo đúng system prompt thật.
  test("Scenario.mode='voice' → system prompt dùng VOICE_GUIDE (không phải mode mặc định)", async () => {
    let seenSystem = "";
    const captureOllama = vi.fn(async (msgs: { role: string; content: string }[]) => {
      seenSystem = msgs[0]?.content ?? "";
      return { message: { content: "trả lời." } };
    });
    await runScenario({ ...scenario, mode: "voice" }, { callOllama: captureOllama, buildTools: () => [] }, 1);
    expect(seenSystem).toContain("giọng nói"); // marker VOICE_GUIDE
    expect(seenSystem).not.toContain("```chart"); // RENDER_GUIDE (mode mặc định) phải vắng mặt
  });

  test("KHÔNG set mode → hành vi CŨ giữ nguyên (RENDER_GUIDE, không phải VOICE_GUIDE)", async () => {
    let seenSystem = "";
    const captureOllama = vi.fn(async (msgs: { role: string; content: string }[]) => {
      seenSystem = msgs[0]?.content ?? "";
      return { message: { content: "trả lời." } };
    });
    await runScenario(scenario, { callOllama: captureOllama, buildTools: () => [] }, 1);
    expect(seenSystem).toContain("```chart");
    expect(seenSystem).not.toContain("giọng nói");
  });

  // WHY: production replay lịch sử chỉ có TEXT user/assistant, KHÔNG có tool result — đo
  // bằng tay đầu phiên xác nhận đây là cơ chế khiến một câu trả lời nông cũ tự lặp lại ở
  // lượt sau, kể cả đổi mode. Eval trước đó luôn dựng lượt đầu ([system, user]) nên không
  // đo được cơ chế này. `priorMessages` chèn ĐÚNG giữa system và user hiện tại, đúng thứ tự
  // và đúng shape (chỉ role+content, không tool_calls) như route.ts replay thật.
  test("Scenario.priorMessages → chèn giữa system và user hiện tại, ĐÚNG thứ tự, không tool_calls", async () => {
    let seenMessages: { role: string; content: string }[] = [];
    const captureOllama = vi.fn(async (msgs: { role: string; content: string }[]) => {
      seenMessages = msgs;
      return { message: { content: "trả lời." } };
    });
    await runScenario(
      {
        ...scenario,
        priorMessages: [
          { role: "user", content: "Cho mình thông tin chi tiết project Dasin" },
          { role: "assistant", content: "Dasin được tạo 21/07/2026, đang active." },
        ],
      },
      { callOllama: captureOllama, buildTools: () => [] },
      1,
    );
    expect(seenMessages.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(seenMessages[1].content).toBe("Cho mình thông tin chi tiết project Dasin");
    expect(seenMessages[2].content).toBe("Dasin được tạo 21/07/2026, đang active.");
    expect(seenMessages[3].content).toBe(scenario.input); // lượt hiện tại luôn ở CUỐI
    expect(seenMessages.some((m) => "tool_calls" in m)).toBe(false); // đúng shape replay thật
  });

  test("KHÔNG set priorMessages → hành vi CŨ giữ nguyên ([system, user], không thừa message)", async () => {
    let seenMessages: unknown[] = [];
    const captureOllama = vi.fn(async (msgs: unknown[]) => {
      seenMessages = msgs;
      return { message: { content: "trả lời." } };
    });
    await runScenario(scenario, { callOllama: captureOllama, buildTools: () => [] }, 1);
    expect(seenMessages).toHaveLength(2);
  });
});
