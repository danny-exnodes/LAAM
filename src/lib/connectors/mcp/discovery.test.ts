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
// listTools now hands back the whole initialize listing (tools + the server's own
// `instructions`), not a bare tool array.
const listing = (tools: RemoteTool[], instructions?: string) => ({ tools, instructions });

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
    h.listTools.mockResolvedValue(listing([tool({ annotations: { readOnlyHint: true } })]));
    const { tools, readAllow } = await discoverForUser("u1");
    expect(tools[0].kind).toBe("write");
    expect(readAllow.size).toBe(0);
  });

  test("trust ON + readOnlyHint → kind read and added to readAllow", async () => {
    h.listServers.mockResolvedValue([server({ slug: "gh", trustReadHints: true })]);
    h.listTools.mockResolvedValue(listing([tool({ name: "search", annotations: { readOnlyHint: true } })]));
    const { tools, readAllow } = await discoverForUser("u1");
    expect(tools[0].kind).toBe("read");
    expect(readAllow.has("mcp__gh__search")).toBe(true);
  });

  test("trust ON but destructiveHint / no hint → write (fail-closed)", async () => {
    h.listServers.mockResolvedValue([server({ trustReadHints: true })]);
    h.listTools.mockResolvedValue(listing([
      tool({ name: "rm", annotations: { destructiveHint: true } }),
      tool({ name: "plain" }), // no annotations at all
    ]));
    const { tools, readAllow } = await discoverForUser("u1");
    expect(tools.every((t) => t.kind === "write")).toBe(true);
    expect(readAllow.size).toBe(0);
  });

  test("namespaces tool names and builds the route map", async () => {
    h.listServers.mockResolvedValue([server({ slug: "linear" })]);
    h.listTools.mockResolvedValue(listing([tool({ name: "create_issue" })]));
    const { tools, route } = await discoverForUser("u1");
    expect(tools[0].function.name).toBe("mcp__linear__create_issue");
    expect(route.get("mcp__linear__create_issue")).toEqual({ slug: "linear", realName: "create_issue" });
  });

  test("a down server is skipped (no throw); other servers still surface", async () => {
    h.listServers.mockResolvedValue([server({ slug: "down" }), server({ slug: "up" })]);
    h.listTools.mockImplementation(async (cfg: McpServerConfig) => {
      if (cfg.slug === "down") throw new Error("ECONNREFUSED");
      return listing([tool({ name: "ok" })]);
    });
    const { tools, route } = await discoverForUser("u1");
    expect(tools).toHaveLength(1);
    expect(route.has("mcp__up__ok")).toBe(true);
  });

  test("defaults parameters/description when the remote tool omits them", async () => {
    h.listServers.mockResolvedValue([server({ slug: "s" })]);
    h.listTools.mockResolvedValue(listing([{ name: "bare", inputSchema: undefined } as unknown as RemoteTool]));
    const { tools } = await discoverForUser("u1");
    expect(tools[0].function.description).toBe("");
    expect(tools[0].function.parameters).toEqual({ type: "object", properties: {} });
  });

  // The server's own initialize text is the only place connection-scope facts (which
  // project, which data_source_id) can reach the model before it picks a tool.
  test("surfaces the server's instructions, labelled by slug", async () => {
    h.listServers.mockResolvedValue([server({ slug: "daab" })]);
    h.listTools.mockResolvedValue(listing([tool()], "scoped to Pharmacy Chain (project_id: p-1)"));
    const { instructions } = await discoverForUser("u1");
    expect(instructions).toEqual([{ slug: "daab", text: "scoped to Pharmacy Chain (project_id: p-1)" }]);
  });

  // A server the user switched every tool OFF for must stop steering the model too —
  // otherwise its instructions keep shaping replies it can no longer act on.
  test("a server with no enabled tool contributes no instructions", async () => {
    h.listServers.mockResolvedValue([server({ slug: "daab", enabledTools: [] })]);
    h.listTools.mockResolvedValue(listing([tool()], "scoped to Pharmacy Chain"));
    const { instructions } = await discoverForUser("u1");
    expect(instructions).toEqual([]);
  });

  // This text lands in the system prompt, so an oversized (or hostile) server must not be
  // able to crowd out the operator's own rules. Truncation stays visible, never silent.
  test("oversized instructions are truncated with a visible marker", async () => {
    h.listServers.mockResolvedValue([server({ slug: "loud" })]);
    h.listTools.mockResolvedValue(listing([tool()], "x".repeat(5_000)));
    const { instructions } = await discoverForUser("u1");
    expect(instructions[0].text.length).toBeLessThan(2_100);
    expect(instructions[0].text).toContain("đã cắt bớt");
  });

  test("caches per-user within the TTL, and invalidateUser forces a refetch", async () => {
    h.listServers.mockResolvedValue([server({ slug: "s" })]);
    h.listTools.mockResolvedValue(listing([tool()]));
    await discoverForUser("u1");
    await discoverForUser("u1");
    expect(h.listServers).toHaveBeenCalledTimes(1); // second call served from cache

    invalidateUser("u1");
    await discoverForUser("u1");
    expect(h.listServers).toHaveBeenCalledTimes(2);
  });
});
