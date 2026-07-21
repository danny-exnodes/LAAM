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
  // SSRF guard: its behaviour is tested in ssrf.test.ts; here it is a no-op by default so the
  // client tests don't touch real DNS, and a throwing spy in the wiring test below.
  assertSafeUrlResolved: vi.fn(async () => undefined),
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
vi.mock("./ssrf", () => ({ assertSafeUrlResolved: h.assertSafeUrlResolved }));

import { listTools, callTool } from "./client";

const cfg: McpServerConfig = { slug: "s", name: "S", url: "https://mcp.example.com", trustReadHints: false };

beforeEach(() => {
  h.connect.mockReset().mockResolvedValue(undefined);
  h.listTools.mockReset().mockResolvedValue({ tools: [] });
  h.callTool.mockReset().mockResolvedValue({ content: [{ type: "text", text: "hi" }] });
  h.close.mockReset().mockResolvedValue(undefined);
  h.streamableCtor.mockReset();
  h.sseCtor.mockReset();
  h.assertSafeUrlResolved.mockReset().mockResolvedValue(undefined);
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

  test("callTool truncates an oversized all-text result with a visible marker", async () => {
    // This is a raw-transport BACKSTOP against a truly pathological result (e.g. a runaway
    // kg_search or a misbehaving MCP server) — the real per-provider shaping happens
    // downstream in boundOutput (guardrails.ts), not here. WHY: an uncapped result previously
    // killed the tool-loop with an empty answer; a too-tight cap HERE (48k) later re-shredded
    // large-but-legitimate results (e.g. a ~78k master record) that a cloud model's boundOutput
    // bound would otherwise have admitted whole — hence a generous 200k backstop.
    const big = "x".repeat(250_000);
    h.callTool.mockResolvedValue({ content: [{ type: "text", text: big }] });
    const res = (await callTool(cfg, "do", {})) as { text: string };
    expect(res.text.length).toBeLessThan(big.length);
    expect(res.text).toContain("rút gọn");
    expect(res.text.startsWith("x".repeat(200_000))).toBe(true);
  });

  // INTENT: a large-but-realistic single result (e.g. a big master record, ~78k) must pass
  // through client.ts UNTRUNCATED — only boundOutput (provider-aware, downstream) decides
  // whether it's small enough for the chosen model. Regression guard for the bug where
  // client.ts's OWN cap sat below boundOutput's cloud bound and pre-emptively shredded it.
  test("callTool does NOT truncate a large-but-realistic result (below the backstop)", async () => {
    const realistic = "x".repeat(78_000);
    h.callTool.mockResolvedValue({ content: [{ type: "text", text: realistic }] });
    const res = (await callTool(cfg, "do", {})) as { text: string };
    expect(res.text).toBe(realistic);
    expect(res.text).not.toContain("rút gọn");
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

  test("caps an absurd tool count from an untrusted server (DoS) and warns", async () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ name: `t${i}`, inputSchema: {} }));
    h.listTools.mockResolvedValue({ tools: many });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const tools = await listTools(cfg);
    expect(tools).toHaveLength(200); // capped, not 250 — no silent unbounded ingestion
    expect(warn).toHaveBeenCalled(); // truncation surfaced, not silent (Rule 12)
    warn.mockRestore();
  });

  test("SSRF guard is wired into connect: a blocked URL never opens a transport", async () => {
    // The connect-time DNS check runs BEFORE any transport is constructed. If it throws
    // (e.g. host resolves to a private IP), no StreamableHTTP/SSE transport is created and
    // no network connection is attempted.
    h.assertSafeUrlResolved.mockRejectedValue(new Error("SSRF chặn"));
    await expect(listTools(cfg)).rejects.toThrow(/SSRF/);
    expect(h.assertSafeUrlResolved).toHaveBeenCalledWith(cfg.url);
    expect(h.streamableCtor).not.toHaveBeenCalled();
    expect(h.sseCtor).not.toHaveBeenCalled();
    expect(h.connect).not.toHaveBeenCalled();
  });
});
