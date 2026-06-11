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
import { addServer, removeServer } from "@/lib/connectors/mcp/store";
import { POST, DELETE } from "./route";

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
