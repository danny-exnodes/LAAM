import { beforeEach, describe, expect, test, vi } from "vitest";
import type { McpServerConfig } from "./types";
import type { RemoteTool } from "./client";

const h = vi.hoisted(() => ({
  listServers: vi.fn(),
  listTools: vi.fn(),
}));

vi.mock("./store", () => ({ listServers: h.listServers }));
vi.mock("./client", () => ({ listTools: h.listTools }));

import { discoverForUser, invalidateUser } from "./discovery";

const server = (over: Partial<McpServerConfig> = {}): McpServerConfig => ({
  slug: "srv",
  name: "Srv",
  url: "https://mcp.example.com",
  trustReadHints: false,
  ...over,
});
const tool = (over: Partial<RemoteTool> = {}): RemoteTool => ({
  name: "do_thing",
  description: "does",
  inputSchema: { type: "object", properties: {} },
  ...over,
});

beforeEach(() => {
  h.listServers.mockReset();
  h.listTools.mockReset();
  invalidateUser("u1");
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("mcp discovery", () => {
  test("trust OFF → kind is write even with readOnlyHint", async () => {
    h.listServers.mockResolvedValue([server({ trustReadHints: false })]);
    h.listTools.mockResolvedValue([tool({ annotations: { readOnlyHint: true } })]);
    const { tools, readAllow } = await discoverForUser("u1");
    expect(tools[0].kind).toBe("write");
    expect(readAllow.size).toBe(0);
  });

  test("trust ON + readOnlyHint → kind read and added to readAllow", async () => {
    h.listServers.mockResolvedValue([server({ slug: "gh", trustReadHints: true })]);
    h.listTools.mockResolvedValue([tool({ name: "search", annotations: { readOnlyHint: true } })]);
    const { tools, readAllow } = await discoverForUser("u1");
    expect(tools[0].kind).toBe("read");
    expect(readAllow.has("mcp__gh__search")).toBe(true);
  });

  test("trust ON but destructiveHint / no hint → write (fail-closed)", async () => {
    h.listServers.mockResolvedValue([server({ trustReadHints: true })]);
    h.listTools.mockResolvedValue([
      tool({ name: "rm", annotations: { destructiveHint: true } }),
      tool({ name: "plain" }), // no annotations at all
    ]);
    const { tools, readAllow } = await discoverForUser("u1");
    expect(tools.every((t) => t.kind === "write")).toBe(true);
    expect(readAllow.size).toBe(0);
  });

  test("namespaces tool names and builds the route map", async () => {
    h.listServers.mockResolvedValue([server({ slug: "linear" })]);
    h.listTools.mockResolvedValue([tool({ name: "create_issue" })]);
    const { tools, route } = await discoverForUser("u1");
    expect(tools[0].function.name).toBe("mcp__linear__create_issue");
    expect(route.get("mcp__linear__create_issue")).toEqual({ slug: "linear", realName: "create_issue" });
  });

  test("a down server is skipped (no throw); other servers still surface", async () => {
    h.listServers.mockResolvedValue([server({ slug: "down" }), server({ slug: "up" })]);
    h.listTools.mockImplementation(async (cfg: McpServerConfig) => {
      if (cfg.slug === "down") throw new Error("ECONNREFUSED");
      return [tool({ name: "ok" })];
    });
    const { tools, route } = await discoverForUser("u1");
    expect(tools).toHaveLength(1);
    expect(route.has("mcp__up__ok")).toBe(true);
  });

  test("defaults parameters/description when the remote tool omits them", async () => {
    h.listServers.mockResolvedValue([server({ slug: "s" })]);
    h.listTools.mockResolvedValue([{ name: "bare", inputSchema: undefined } as unknown as RemoteTool]);
    const { tools } = await discoverForUser("u1");
    expect(tools[0].function.description).toBe("");
    expect(tools[0].function.parameters).toEqual({ type: "object", properties: {} });
  });

  test("caches per-user within the TTL, and invalidateUser forces a refetch", async () => {
    h.listServers.mockResolvedValue([server({ slug: "s" })]);
    h.listTools.mockResolvedValue([tool()]);
    await discoverForUser("u1");
    await discoverForUser("u1");
    expect(h.listServers).toHaveBeenCalledTimes(1); // second call served from cache

    invalidateUser("u1");
    await discoverForUser("u1");
    expect(h.listServers).toHaveBeenCalledTimes(2);
  });
});
