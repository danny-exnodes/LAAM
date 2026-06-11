import { describe, expect, test, vi } from "vitest";
import { runConnectorNode, runAgentNode } from "./executors";
import { emptyContext } from "./types";
import type { WfConnectorNode, WfAgentNode } from "./types";

describe("runConnectorNode", () => {
  test("interpolate args rồi execute; trả output", async () => {
    const ctx = emptyContext({});
    ctx.steps["n0"] = { output: { pri: 2 } };
    const node: WfConnectorNode = { id: "n1", kind: "connector", connectorId: "demo", action: "demo_create_task", args: { priority: "{{steps.n0.output.pri}}", title: "x" } };
    const execute = vi.fn(async () => ({ id: "t1" }));
    const out = await runConnectorNode(node, ctx, { execute });
    expect(execute).toHaveBeenCalledWith("demo_create_task", { priority: 2, title: "x" });
    expect(out).toEqual({ id: "t1" });
  });

  test("execute trả {error} → throw (fail-stop node)", async () => {
    const node: WfConnectorNode = { id: "n1", kind: "connector", connectorId: "demo", action: "demo_list_tasks", args: {} };
    const execute = vi.fn(async () => ({ error: "chưa kết nối" }));
    await expect(runConnectorNode(node, emptyContext({}), { execute })).rejects.toThrow(/chưa kết nối/);
  });
});

describe("runAgentNode", () => {
  test("build messages từ prompt, chạy rounds, lấy text câu cuối", async () => {
    const ctx = emptyContext({});
    ctx.steps["n0"] = { output: { count: 3 } };
    const node: WfAgentNode = { id: "n1", kind: "agent", system: "SYS", prompt: "Có {{steps.n0.output.count}} việc." };
    const runRounds = vi.fn(async (messages) => messages); // no tool calls → trả nguyên
    const callOllama = vi.fn(async () => ({ message: { content: "Tóm tắt: 3 việc." } }));
    const out = await runAgentNode(node, ctx, { runRounds, callOllama, dispatch: vi.fn(), tools: [] });
    expect(runRounds.mock.calls[0][0]).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "Có 3 việc." },
    ]);
    expect(callOllama).toHaveBeenLastCalledWith(expect.any(Array), []);
    expect(out).toBe("Tóm tắt: 3 việc.");
  });
});

// ── B1: structured output (format JSON-schema) ──────────────────────────────
// WHY: judge-verify patterns cần output là OBJECT để condition `eq` trên field
// enum ({{steps.judge.output.verdict}}) — không contains() trên free-text 8B.
describe("runAgentNode — structured output (format)", () => {
  const FORMAT = {
    type: "object",
    properties: { verdict: { enum: ["PASS", "FAIL"] }, reason: { type: "string" } },
    required: ["verdict"],
  };
  const node: WfAgentNode = { id: "judge", kind: "agent", prompt: "Đánh giá kết quả.", format: FORMAT };
  const deps = (callOllama: ReturnType<typeof vi.fn>) => ({
    runRounds: vi.fn(async (messages: unknown[]) => messages) as never,
    callOllama: callOllama as never,
    dispatch: vi.fn(),
    tools: [],
  });

  test("format → truyền vào call CUỐI; output = object đã parse", async () => {
    const callOllama = vi.fn(async () => ({ message: { content: '{"verdict":"PASS","reason":"ok"}' } }));
    const out = await runAgentNode(node, emptyContext({}), deps(callOllama));
    expect(out).toEqual({ verdict: "PASS", reason: "ok" });
    expect(callOllama).toHaveBeenCalledTimes(1);
    expect(callOllama).toHaveBeenLastCalledWith(expect.any(Array), [], FORMAT);
  });

  test("JSON rác → 1 self-repair retry (re-ask kèm parse error) rồi parse được", async () => {
    const callOllama = vi
      .fn()
      .mockResolvedValueOnce({ message: { content: "PASS — looks fine" } })
      .mockResolvedValueOnce({ message: { content: '{"verdict":"FAIL"}' } });
    const out = await runAgentNode(node, emptyContext({}), deps(callOllama));
    expect(out).toEqual({ verdict: "FAIL" });
    expect(callOllama).toHaveBeenCalledTimes(2);
    // retry re-asks: convo + câu trả lời hỏng (assistant) + yêu cầu sửa (user), vẫn kèm format
    const retryMsgs = callOllama.mock.calls[1][0] as { role: string; content: string }[];
    expect(retryMsgs.some((m) => m.role === "assistant" && m.content.includes("PASS — looks fine"))).toBe(true);
    expect(retryMsgs[retryMsgs.length - 1].role).toBe("user");
    expect(callOllama.mock.calls[1][2]).toEqual(FORMAT);
  });

  test("rác cả 2 lần → fail-loud, message nêu node id + lý do", async () => {
    const callOllama = vi.fn(async () => ({ message: { content: "vẫn không phải json" } }));
    await expect(runAgentNode(node, emptyContext({}), deps(callOllama))).rejects.toThrow(/judge.*JSON|JSON.*judge/is);
    expect(callOllama).toHaveBeenCalledTimes(2); // đúng 1 retry, không loop
  });

  test("không có format → hành vi text giữ nguyên (không truyền format)", async () => {
    const plain: WfAgentNode = { id: "n1", kind: "agent", prompt: "x" };
    const callOllama = vi.fn(async (..._a: unknown[]) => ({ message: { content: '{"looks":"like json"}' } }));
    const out = await runAgentNode(plain, emptyContext({}), deps(callOllama));
    expect(out).toBe('{"looks":"like json"}'); // KHÔNG parse khi không có format
    expect(callOllama.mock.calls[0][2]).toBeUndefined();
  });
});
