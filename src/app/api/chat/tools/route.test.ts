// P1: catalog endpoint per-user. Intent: picker KHÔNG được chết vì một nguồn
// (connectors/MCP) sập — internal tools luôn phải có (fail-soft như chatTools).
import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/connectors", () => ({
  list: vi.fn(async () => []),
  chatTools: vi.fn(async () => []),
}));
vi.mock("@/lib/connectors/mcp/store", () => ({ listServers: vi.fn(async () => []) }));

import { auth } from "@/auth";
import { list, chatTools } from "@/lib/connectors";
import { listServers } from "@/lib/connectors/mcp/store";
import { GET } from "./route";

const mockAuth = vi.mocked(auth);

describe("GET /api/chat/tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(list).mockResolvedValue([]);
    vi.mocked(chatTools).mockResolvedValue([]);
    vi.mocked(listServers).mockResolvedValue([]);
  });

  test("401 chưa đăng nhập", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await GET()).status).toBe(401);
  });

  test("200 → groups, internal luôn có (11 internal tool thật từ registry)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    const res = await GET();
    expect(res.status).toBe(200);
    const j = (await res.json()) as { groups: { id: string; tools: { name: string }[] }[] };
    expect(j.groups[0].id).toBe("internal");
    expect(j.groups[0].tools.length).toBeGreaterThan(0);
    expect(j.groups[0].tools.some((t) => t.name === "laam_list_agents")).toBe(true);
  });

  test("list/chatTools/listServers ném → fail-soft, vẫn 200 với internal", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    vi.mocked(list).mockRejectedValue(new Error("db down"));
    vi.mocked(chatTools).mockRejectedValue(new Error("down"));
    vi.mocked(listServers).mockRejectedValue(new Error("down"));
    const res = await GET();
    expect(res.status).toBe(200);
    const j = (await res.json()) as { groups: { id: string }[] };
    expect(j.groups.length).toBe(1);
    expect(j.groups[0].id).toBe("internal");
  });
});
