import { describe, expect, test, vi } from "vitest";

// Isolate the MCP wiring in index.ts: empty static registry + mocked mcp/* modules,
// so we test the delegation (chatTools append, execute routing, readAllow) only.
vi.mock("./registry", () => ({ CONNECTORS: [] }));
vi.mock("./mcp/discovery", () => ({
  discoverForUser: vi.fn(async () => ({
    tools: [
      { type: "function", kind: "read", function: { name: "mcp__slack__search", description: "d", parameters: {} } },
    ],
    readAllow: new Set(["mcp__slack__search"]),
    route: new Map([["mcp__slack__search", { slug: "slack", realName: "search" }]]),
  })),
  invalidateUser: vi.fn(),
}));
vi.mock("./mcp/store", () => ({
  getServer: vi.fn(async () => ({ slug: "slack", name: "Slack", url: "https://x.example", trustReadHints: true })),
}));
vi.mock("./mcp/client", () => ({ callTool: vi.fn(async () => ({ text: "ok-result" })) }));

import { chatTools, execute, mcpReadAllow } from "./index";
import { callTool as mcpCallTool } from "./mcp/client";

describe("index — MCP wiring", () => {
  test("chatTools appends discovered MCP tools", async () => {
    const tools = await chatTools("u1");
    expect(tools.map((t) => t.function.name)).toContain("mcp__slack__search");
  });

  test("mcpReadAllow returns the discovery readAllow set", async () => {
    expect([...(await mcpReadAllow("u1"))]).toEqual(["mcp__slack__search"]);
  });

  test("execute routes an mcp__ name to the MCP client with the real (un-namespaced) tool name", async () => {
    const r = await execute("u1", "mcp__slack__search", { q: "hi" });
    expect(r).toEqual({ text: "ok-result" });
    expect(mcpCallTool).toHaveBeenCalledWith(expect.objectContaining({ slug: "slack" }), "search", { q: "hi" });
  });

  test("execute on an mcp__ name not in the route → error (never throws)", async () => {
    const r = await execute("u1", "mcp__slack__unknown", {});
    expect(r).toHaveProperty("error");
  });

  test("bounds an oversized error message from an untrusted MCP server (cost/DoS guard)", async () => {
    vi.mocked(mcpCallTool).mockRejectedValueOnce(new Error("X".repeat(5000)));
    const r = (await execute("u1", "mcp__slack__search", {})) as { error: string };
    expect(r.error.length).toBeLessThanOrEqual(400); // bounded, not the raw 5000 chars
    expect(r.error).toContain("mcp__slack__search"); // still says which tool failed
  });
});
