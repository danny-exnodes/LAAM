import { describe, expect, test, vi } from "vitest";
import { handleMcpRequest, MCP_PROTOCOL_VERSION, type McpDeps } from "./handler";

const deps = (over: Partial<McpDeps> = {}): McpDeps => ({
  listTools: () => [{ name: "laam_list_agents", description: "d", inputSchema: { type: "object" } }],
  callTool: vi.fn(async () => ({ ok: true, result: { agents: [] } })),
  serverInfo: { name: "LAAM", version: "2.0.0" },
  ...over,
});

describe("handleMcpRequest", () => {
  test("initialize → protocol version + tools capability + serverInfo", async () => {
    const res = await handleMcpRequest({ id: 1, method: "initialize" }, deps());
    expect(res).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "LAAM", version: "2.0.0" },
      },
    });
  });

  test("tools/list → defs", async () => {
    const res = await handleMcpRequest({ id: 2, method: "tools/list" }, deps());
    expect((res as { result: { tools: unknown[] } }).result.tools).toHaveLength(1);
  });

  test("tools/call → runs tool, wraps result as text content", async () => {
    const callTool = vi.fn(async () => ({ ok: true, result: { agents: [{ id: "s1" }] } }));
    const res = await handleMcpRequest(
      { id: 3, method: "tools/call", params: { name: "laam_list_agents", arguments: { limit: 5 } } },
      deps({ callTool }),
    );
    expect(callTool).toHaveBeenCalledWith("laam_list_agents", { limit: 5 });
    const r = (res as { result: { content: { text: string }[]; isError: boolean } }).result;
    expect(r.isError).toBe(false);
    expect(JSON.parse(r.content[0].text)).toEqual({ agents: [{ id: "s1" }] });
  });

  test("tools/call with a failing tool → isError true (not a protocol error)", async () => {
    const res = await handleMcpRequest(
      { id: 4, method: "tools/call", params: { name: "laam_x" } },
      deps({ callTool: vi.fn(async () => ({ ok: false, result: { error: "boom" } })) }),
    );
    const r = (res as { result: { isError: boolean } }).result;
    expect(r.isError).toBe(true);
  });

  test("tools/call missing name → -32602", async () => {
    const res = await handleMcpRequest({ id: 5, method: "tools/call", params: {} }, deps());
    expect((res as { error: { code: number } }).error.code).toBe(-32602);
  });

  test("unknown method → -32601", async () => {
    const res = await handleMcpRequest({ id: 6, method: "resources/list" }, deps());
    expect((res as { error: { code: number } }).error.code).toBe(-32601);
  });

  test("notification (no id) → null, tool not run", async () => {
    const callTool = vi.fn(async () => ({ ok: true, result: {} }));
    const res = await handleMcpRequest({ method: "notifications/initialized" }, deps({ callTool }));
    expect(res).toBeNull();
    expect(callTool).not.toHaveBeenCalled();
  });
});
