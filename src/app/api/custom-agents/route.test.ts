// P3 custom-agents: GET (list) + POST (create). Intent: per-user resource —
// viewer read-only không được tạo (403, không insert); name/system bắt buộc
// (400 fail-loud, không insert rác).
import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/customAgents", () => ({ listCustomAgents: vi.fn(async () => []) }));

const { insertSpy, valuesSpy, returningSpy } = vi.hoisted(() => {
  const returningSpy = vi.fn(async () => [{ id: "ca-1", name: "Tóm tắt", system: "Bạn là...", userId: "u1" }]);
  const valuesSpy = vi.fn(() => ({ returning: returningSpy }));
  const insertSpy = vi.fn(() => ({ values: valuesSpy }));
  return { insertSpy, valuesSpy, returningSpy };
});
vi.mock("@/db", () => ({ db: { insert: insertSpy } }));

import { auth } from "@/auth";
import { listCustomAgents } from "@/lib/customAgents";
import { GET, POST } from "./route";

const mockAuth = vi.mocked(auth);

function postReq(body: unknown) {
  return new Request("http://x/api/custom-agents", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/custom-agents", () => {
  test("401 chưa đăng nhập", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await GET()).status).toBe(401);
  });

  test("200 → {agents} của đúng user", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    vi.mocked(listCustomAgents).mockResolvedValue([{ id: "ca-1", name: "Tóm tắt" }] as never);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(vi.mocked(listCustomAgents)).toHaveBeenCalledWith("u1");
    const j = (await res.json()) as { agents: { id: string }[] };
    expect(j.agents[0].id).toBe("ca-1");
  });
});

describe("POST /api/custom-agents — RBAC + validate", () => {
  test("401 chưa đăng nhập — không insert", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await POST(postReq({ name: "x", system: "y" }))).status).toBe(401);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  test("viewer → 403, không insert", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "viewer" } } as never);
    expect((await POST(postReq({ name: "x", system: "y" }))).status).toBe(403);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  test("thiếu name/system → 400 fail-loud, không insert", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    expect((await POST(postReq({ name: "", system: "y" }))).status).toBe(400);
    expect((await POST(postReq({ name: "x", system: "   " }))).status).toBe(400);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  test("member hợp lệ → insert với userId, trả agent", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const res = await POST(postReq({ name: "Tóm tắt", system: "Bạn là...", description: "d" }));
    expect(res.status).toBe(200);
    expect(valuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", name: "Tóm tắt", system: "Bạn là...", description: "d" }),
    );
    const j = (await res.json()) as { ok: boolean; agent: { id: string } };
    expect(j.ok).toBe(true);
    expect(j.agent.id).toBe("ca-1");
  });
});
