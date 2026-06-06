import { beforeEach, describe, expect, test, vi } from "vitest";
import type { McpServerConfig } from "./types";

// Shared spies so each test can tweak the mocked SDK behaviour.
const h = vi.hoisted(() => ({
  connect: vi.fn(async () => undefined),
  listTools: vi.fn(async () => ({ tools: [] as unknown[] })),
  callTool: vi.fn(async () => ({ content: [{ type: "text", text: "hi" }] })),
  close: vi.fn(async () => undefined),
  streamableCtor: vi.fn(),
  sseCtor: vi.fn(),
}));

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  // Regular function (not arrow) so it is constructable with `new`.
  Client: vi.fn(function () {
    return {
      connect: h.connect,
      listTools: h.listTools,
      callTool: h.callTool,
      close: h.close,
    };
  }),
}));
vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: vi.fn(function (url: URL, opts: unknown) {
    h.streamableCtor(url, opts);
    return { kind: "streamable" };
  }),
}));
vi.mock("@modelcontextprotocol/sdk/client/sse.js", () => ({
  SSEClientTransport: vi.fn(function (url: URL, opts: unknown) {
    h.sseCtor(url, opts);
    return { kind: "sse" };
  }),
}));

import { listTools, callTool } from "./client";

const cfg: McpServerConfig = { slug: "s", name: "S", url: "https://mcp.example.com", trustReadHints: false };

beforeEach(() => {
  h.connect.mockReset().mockResolvedValue(undefined);
  h.listTools.mockReset().mockResolvedValue({ tools: [] });
  h.callTool.mockReset().mockResolvedValue({ content: [{ type: "text", text: "hi" }] });
  h.close.mockReset().mockResolvedValue(undefined);
  h.streamableCtor.mockReset();
  h.sseCtor.mockReset();
});

describe("mcp client", () => {
  test("listTools returns the tools and always closes", async () => {
    h.listTools.mockResolvedValue({ tools: [{ name: "a", inputSchema: {} }] });
    const tools = await listTools(cfg);
    expect(tools).toEqual([{ name: "a", inputSchema: {} }]);
    expect(h.close).toHaveBeenCalledTimes(1);
    // streamable tried first, no SSE fallback when connect succeeds.
    expect(h.streamableCtor).toHaveBeenCalledTimes(1);
    expect(h.sseCtor).not.toHaveBeenCalled();
  });

  test("falls back to SSE when the streamable connect throws", async () => {
    h.connect.mockRejectedValueOnce(new Error("405")).mockResolvedValueOnce(undefined);
    await listTools(cfg);
    expect(h.streamableCtor).toHaveBeenCalledTimes(1);
    expect(h.sseCtor).toHaveBeenCalledTimes(1);
    expect(h.connect).toHaveBeenCalledTimes(2);
  });

  test("passes a Bearer auth header when authToken is set", async () => {
    await listTools({ ...cfg, authToken: "secret-tok" });
    const opts = h.streamableCtor.mock.calls[0][1];
    expect(opts.requestInit.headers.Authorization).toBe("Bearer secret-tok");
  });

  test("omits requestInit when there is no authToken", async () => {
    await listTools(cfg);
    const opts = h.streamableCtor.mock.calls[0][1];
    expect(opts.requestInit).toBeUndefined();
  });

  test("callTool flattens all-text content into { text }", async () => {
    h.callTool.mockResolvedValue({
      content: [
        { type: "text", text: "line1" },
        { type: "text", text: "line2" },
      ],
    });
    const res = await callTool(cfg, "do", { x: 1 });
    expect(res).toEqual({ text: "line1\nline2" });
    expect(h.callTool).toHaveBeenCalledWith({ name: "do", arguments: { x: 1 } });
    expect(h.close).toHaveBeenCalledTimes(1);
  });

  test("callTool returns raw content when a block is non-text", async () => {
    const content: unknown[] = [
      { type: "text", text: "hi" },
      { type: "image", data: "..." },
    ];
    h.callTool.mockResolvedValue({ content } as never);
    const res = await callTool(cfg, "do", {});
    expect(res).toEqual({ content });
  });

  test("closes the client even when the operation throws", async () => {
    h.callTool.mockRejectedValue(new Error("boom"));
    await expect(callTool(cfg, "do", {})).rejects.toThrow("boom");
    expect(h.close).toHaveBeenCalledTimes(1);
  });
});
