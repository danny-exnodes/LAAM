import { describe, expect, test, vi } from "vitest";

// The route module pulls in @/auth, @/db and @/lib/connectors at import time —
// stub them so the module loads under vitest. We only exercise the pure
// runToolRounds helper here (no auth/db/connector I/O).
vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/connectors", () => ({
  chatTools: vi.fn(async () => []),
  execute: vi.fn(async () => ({})),
}));

import { runToolRounds } from "./route";

const tools = [
  {
    type: "function" as const,
    function: { name: "github_list_repos", description: "list repos", parameters: {} },
  },
];

const baseMessages = [
  { role: "system", content: "SYS" },
  { role: "user", content: "list my repos" },
];

describe("runToolRounds", () => {
  test("executes a tool_call, appends the result, then returns the final messages", async () => {
    const callOllama = vi
      .fn()
      // round 1: model asks to call the tool
      .mockResolvedValueOnce({
        message: {
          content: "",
          tool_calls: [
            {
              function: { name: "github_list_repos", arguments: { visibility: "public" } },
            },
          ],
        },
      })
      // round 2: model answers with text, no tool_calls
      .mockResolvedValueOnce({ message: { content: "Here are your repos." } });
    const execute = vi.fn(async () => [{ name: "laam" }]);

    const out = await runToolRounds(baseMessages, tools, { callOllama, execute });

    // The tool was executed exactly once with the parsed name + args.
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith("github_list_repos", { visibility: "public" });
    // Two Ollama rounds: the tool round + the final text round.
    expect(callOllama).toHaveBeenCalledTimes(2);

    // Original messages preserved at the front.
    expect(out.slice(0, 2)).toEqual(baseMessages);
    // The assistant tool_calls message was appended.
    const assistant = out.find((m) => m.role === "assistant");
    expect(assistant).toBeTruthy();
    // The tool result was appended as a role:"tool" message containing the
    // JSON-serialised execute() return value.
    const toolMsg = out.find((m) => m.role === "tool");
    expect(toolMsg).toBeTruthy();
    expect(toolMsg!.content).toBe(JSON.stringify([{ name: "laam" }]));
  });

  test("returns messages unchanged and skips execute when the model emits no tool_calls", async () => {
    const callOllama = vi.fn(async () => ({ message: { content: "Hi there." } }));
    const execute = vi.fn(async () => ({}));

    const out = await runToolRounds(baseMessages, tools, { callOllama, execute });

    expect(execute).not.toHaveBeenCalled();
    expect(callOllama).toHaveBeenCalledTimes(1);
    expect(out).toEqual(baseMessages);
  });

  test("is bounded — stops after maxRounds even if the model keeps calling tools", async () => {
    // Model ALWAYS asks for a tool — the loop must not run forever.
    const callOllama = vi.fn(
      async (_messages: unknown, _tools: unknown) => ({
        message: {
          content: "",
          tool_calls: [{ function: { name: "github_list_repos", arguments: {} } }],
        },
      }),
    );
    const execute = vi.fn(async () => ({ ok: true }));

    const out = await runToolRounds(baseMessages, tools, { callOllama, execute }, 4);

    // Exactly maxRounds Ollama calls, no more.
    expect(callOllama).toHaveBeenCalledTimes(4);
    // The final round is requested WITHOUT tools so the model can produce text.
    const lastCall = callOllama.mock.calls[callOllama.mock.calls.length - 1];
    expect(lastCall[1]).toEqual([]);
    // Tools executed only on the rounds that allowed them (maxRounds-1 = 3).
    expect(execute).toHaveBeenCalledTimes(3);
    // Returned conversation includes the originals.
    expect(out.slice(0, 2)).toEqual(baseMessages);
  });
});
