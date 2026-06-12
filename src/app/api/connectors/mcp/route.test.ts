// POST/DELETE /api/connectors/mcp — adding an MCP server stores an auth token and
// arms tool discovery (a write surface); removing one mutates the user's server set.
// A read-only viewer must not touch either. Gate is before addServer/removeServer.
import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/connectors/mcp/store", () => ({
  listServers: vi.fn(async () => []),
  addServer: vi.fn(async () => ({ ok: true, slug: "s1" })),
  removeServer: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/connectors/mcp/discovery", () => ({
  discoverForUser: vi.fn(async () => ({ route: new Map() })),
  invalidateUser: vi.fn(),
}));

import { auth } from "@/auth";
import { addServer, removeServer, listServers } from "@/lib/connectors/mcp/store";
import { discoverForUser } from "@/lib/connectors/mcp/discovery";
import { GET, POST, DELETE } from "./route";

const mockAuth = vi.mocked(auth);
const mockAdd = vi.mocked(addServer);
const mockRemove = vi.mocked(removeServer);

function postReq(body: unknown) {
  return new Request("http://x/api/connectors/mcp", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
function delReq(slug = "s1") {
  return new Request(`http://x/api/connectors/mcp?slug=${slug}`, { method: "DELETE" });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// P2.3: GET trả thêm toolDetails (tên thật + nsName + description + parameters +
// kind) per-server — editor MCP-node form cần schema để render SchemaArgsForm.
// `tools` (string[] namespaced) GIỮ NGUYÊN — backward compat UI hiện có.
describe("GET /api/connectors/mcp — toolDetails (P2.3)", () => {
  test("server có tool → toolDetails đầy đủ, tools (string[]) giữ nguyên", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    vi.mocked(listServers).mockResolvedValue([
      { slug: "daab", name: "DAAB", url: "https://x", trustReadHints: true },
    ] as never);
    vi.mocked(discoverForUser).mockResolvedValue({
      route: new Map([["mcp__daab__kg_query", { slug: "daab", realName: "kg_query" }]]),
      tools: [
        {
          type: "function",
          kind: "read",
          function: {
            name: "mcp__daab__kg_query",
            description: "truy vấn KG",
            parameters: { type: "object", properties: { project_id: { type: "string" } }, required: ["project_id"] },
          },
        },
      ],
      readAllow: new Set(["mcp__daab__kg_query"]),
    } as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const j = (await res.json()) as { servers: { slug: string; tools: string[]; toolDetails: { name: string; nsName: string; kind: string; parameters: unknown }[] }[] };
    expect(j.servers[0].tools).toEqual(["mcp__daab__kg_query"]);
    expect(j.servers[0].toolDetails[0]).toMatchObject({
      name: "kg_query",
      nsName: "mcp__daab__kg_query",
      description: "truy vấn KG",
      kind: "read",
    });
    expect(j.servers[0].toolDetails[0].parameters).toMatchObject({ type: "object" });
  });

  test("discovery sập → vẫn 200, toolDetails rỗng (best-effort)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    vi.mocked(listServers).mockResolvedValue([
      { slug: "daab", name: "DAAB", url: "https://x", trustReadHints: false },
    ] as never);
    vi.mocked(discoverForUser).mockRejectedValue(new Error("down"));
    const res = await GET();
    expect(res.status).toBe(200);
    const j = (await res.json()) as { servers: { toolDetails: unknown[] }[] };
    expect(j.servers[0].toolDetails).toEqual([]);
  });
});

describe("POST /api/connectors/mcp — RBAC (stores an auth token)", () => {
  test("401 khi chưa đăng nhập — addServer never called", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await POST(postReq({ name: "Srv", url: "https://x", authToken: "tok" }));
    expect(res.status).toBe(401);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  test("viewer → 403, server NOT added (no token stored)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "viewer" } } as never);
    const res = await POST(postReq({ name: "Srv", url: "https://x", authToken: "tok" }));
    expect(res.status).toBe(403);
    // Load-bearing: a viewer cannot persist an MCP server + its auth token.
    expect(mockAdd).not.toHaveBeenCalled();
  });

  test("member → addServer called (200)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const res = await POST(postReq({ name: "Srv", url: "https://x", authToken: "tok" }));
    expect(res.status).toBe(200);
    expect(mockAdd).toHaveBeenCalledTimes(1);
  });
});

describe("DELETE /api/connectors/mcp — RBAC", () => {
  test("401 khi chưa đăng nhập — removeServer never called", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await DELETE(delReq());
    expect(res.status).toBe(401);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  test("viewer → 403, server NOT removed", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "viewer" } } as never);
    const res = await DELETE(delReq());
    expect(res.status).toBe(403);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  test("member → removeServer called", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const res = await DELETE(delReq());
    expect(res.status).toBe(200);
    expect(mockRemove).toHaveBeenCalledWith("u1", "s1");
  });
});
