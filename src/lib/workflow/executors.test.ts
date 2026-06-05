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
