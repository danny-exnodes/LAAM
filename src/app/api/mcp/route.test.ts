import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/lib/access-token", () => ({ verifyAccessToken: vi.fn() }));
vi.mock("@/lib/mcp-server/tools", () => ({
  mcpToolDefs: () => [{ name: "laam_list_agents", description: "d", inputSchema: { type: "object" } }],
  getMcpTool: vi.fn(),
}));

import { verifyAccessToken } from "@/lib/access-token";
import { getMcpTool } from "@/lib/mcp-server/tools";

const mockVerify = vi.mocked(verifyAccessToken);
const mockGetTool = vi.mocked(getMcpTool);

vi.mock("@/db/schema", () => ({ agentSessions: { __t: "agent_session" } }));
const inserts: unknown[] = [];
vi.mock("@/db", () => ({
  db: { insert: () => ({ values: async (v: unknown) => { inserts.push(v); } }) },
}));

import { POST } from "./route";

function rpc(token: string | undefined, payload: unknown) {
  return new Request("http://x/api/mcp", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(payload),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  inserts.length = 0;
});

describe("POST /api/mcp — auth", () => {
  test("missing token → 401", async () => {
    const res = await POST(rpc(undefined, { id: 1, method: "initialize" }));
    expect(res.status).toBe(401);
  });

  test("collector-kind token rejected → 401", async () => {
    mockVerify.mockResolvedValue({ id: "t", kind: "collector", userId: "u1" } as never);
    const res = await POST(rpc("laam_c", { id: 1, method: "initialize" }));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/mcp — protocol (valid mcp token)", () => {
  beforeEach(() => {
    mockVerify.mockResolvedValue({ id: "t", kind: "mcp", userId: "u1" } as never);
  });

  test("initialize → serverInfo", async () => {
    const res = await POST(rpc("laam_m", { id: 1, method: "initialize" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.serverInfo.name).toBe("LAAM");
    expect(body.result.capabilities.tools).toBeDefined();
  });

  test("tools/list → defs", async () => {
    const res = await POST(rpc("laam_m", { id: 2, method: "tools/list" }));
    const body = await res.json();
    expect(body.result.tools[0].name).toBe("laam_list_agents");
  });

  test("tools/call → runs tool, records a monitored session (source mcp, principal)", async () => {
    mockGetTool.mockReturnValue({
      name: "laam_list_agents",
      kind: "read",
      description: "",
      parameters: {},
      handler: async () => ({ agents: [] }),
    } as never);
    const res = await POST(
      rpc("laam_m", { id: 3, method: "tools/call", params: { name: "laam_list_agents", arguments: {} } }),
    );
    const body = await res.json();
    expect(body.result.isError).toBe(false);
    expect(JSON.parse(body.result.content[0].text)).toEqual({ agents: [] });
    // monitored session recorded
    expect(inserts).toHaveLength(1);
    const row = inserts[0] as { source: string; userId: string; latestActivity: string; machineId: null };
    expect(row.source).toBe("mcp");
    expect(row.userId).toBe("u1");
    expect(row.machineId).toBeNull();
    expect(row.latestActivity).toContain("laam_list_agents");
  });

  test("tools/call unknown tool → isError, no session recorded", async () => {
    mockGetTool.mockReturnValue(undefined as never);
    const res = await POST(
      rpc("laam_m", { id: 4, method: "tools/call", params: { name: "nope" } }),
    );
    const body = await res.json();
    expect(body.result.isError).toBe(true);
    expect(inserts).toHaveLength(0);
  });

  test("notification → 202 no body", async () => {
    const res = await POST(rpc("laam_m", { method: "notifications/initialized" }));
    expect(res.status).toBe(202);
  });
});
