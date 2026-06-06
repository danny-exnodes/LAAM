import { describe, expect, test, vi } from "vitest";
// MIGRATED từ src/app/api/chat/tool-loop.test.ts: runToolRounds nay ở đây và nhận
// deps.dispatch (trước là deps.execute). orchestrator.ts chỉ import 1 TYPE từ
// @/lib/connectors → không cần mock module nào. (File cũ bị xoá ở task sau.)
import { runToolRounds } from "./orchestrator";
import type { ChatMessage } from "./orchestrator";

const tools = [
  { type: "function" as const, kind: "read" as const, function: { name: "github_list_repos", description: "list repos", parameters: {} } },
];
const baseMessages: ChatMessage[] = [
  { role: "system", content: "SYS" },
  { role: "user", content: "list my repos" },
];

describe("runToolRounds", () => {
  test("chạy tool_call, nối kết quả, trả messages cuối", async () => {
    const callOllama = vi
      .fn()
      .mockResolvedValueOnce({
        message: { content: "", tool_calls: [{ function: { name: "github_list_repos", arguments: { visibility: "public" } } }] },
      })
      .mockResolvedValueOnce({ message: { content: "Here are your repos." } });
    const dispatch = vi.fn(async () => [{ name: "laam" }]);

    const out = await runToolRounds(baseMessages, tools, { callOllama, dispatch });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith("github_list_repos", { visibility: "public" });
    expect(callOllama).toHaveBeenCalledTimes(2);
    expect(out.slice(0, 2)).toEqual(baseMessages);
    expect(out.find((m) => m.role === "assistant")).toBeTruthy();
    const toolMsg = out.find((m) => m.role === "tool");
    expect(toolMsg!.content).toBe(JSON.stringify([{ name: "laam" }]));
  });

  test("không tool_calls → trả nguyên, không gọi dispatch", async () => {
    const callOllama = vi.fn(async () => ({ message: { content: "Hi there." } }));
    const dispatch = vi.fn(async () => ({}));
    const out = await runToolRounds(baseMessages, tools, { callOllama, dispatch });
    expect(dispatch).not.toHaveBeenCalled();
    expect(callOllama).toHaveBeenCalledTimes(1);
    expect(out).toEqual(baseMessages);
  });

  test("bounded — dừng sau maxRounds dù model cứ gọi tool", async () => {
    const callOllama = vi.fn(async (_messages: unknown, _tools: unknown) => ({
      message: { content: "", tool_calls: [{ function: { name: "github_list_repos", arguments: {} } }] },
    }));
    const dispatch = vi.fn(async () => ({ ok: true }));
    const out = await runToolRounds(baseMessages, tools, { callOllama, dispatch }, 4);
    expect(callOllama).toHaveBeenCalledTimes(4);
    const lastCall = callOllama.mock.calls[callOllama.mock.calls.length - 1];
    expect(lastCall[1]).toEqual([]);
    expect(dispatch).toHaveBeenCalledTimes(3);
    expect(out.slice(0, 2)).toEqual(baseMessages);
  });
});
