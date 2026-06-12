// P3 custom-agents/[id]: PATCH + DELETE. Intent: ownership qua getCustomAgent
// (per-user filter ở tầng query) — preset user khác = 404; viewer = 403 trước
// mọi mutation; PATCH field rỗng tường minh → 400 (không ghi đè rác).
import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/customAgents", () => ({ getCustomAgent: vi.fn(async () => null) }));

// Review-fix: PATCH/DELETE phải kiểm rows-affected qua .returning() — race
// "ownership check pass → row bị xoá đồng thời" không được trả {ok:true} giả.
const { updateSpy, setSpy, deleteSpy, whereDeleteSpy, updateReturningSpy, deleteReturningSpy } = vi.hoisted(() => {
  const updateReturningSpy = vi.fn(async (): Promise<{ id: string }[]> => [{ id: "ca-1" }]);
  const whereUpdateSpy = vi.fn(() => ({ returning: updateReturningSpy }));
  const setSpy = vi.fn(() => ({ where: whereUpdateSpy }));
  const updateSpy = vi.fn(() => ({ set: setSpy }));
  const deleteReturningSpy = vi.fn(async (): Promise<{ id: string }[]> => [{ id: "ca-1" }]);
  const whereDeleteSpy = vi.fn(() => ({ returning: deleteReturningSpy }));
  const deleteSpy = vi.fn(() => ({ where: whereDeleteSpy }));
  return { updateSpy, setSpy, deleteSpy, whereDeleteSpy, updateReturningSpy, deleteReturningSpy };
});
vi.mock("@/db", () => ({ db: { update: updateSpy, delete: deleteSpy } }));

import { auth } from "@/auth";
import { getCustomAgent } from "@/lib/customAgents";
import { PATCH, DELETE } from "./route";

const mockAuth = vi.mocked(auth);
const mockGet = vi.mocked(getCustomAgent);
const params = { params: Promise.resolve({ id: "ca-1" }) };
const OWNED = { id: "ca-1", userId: "u1", name: "Tóm tắt", system: "S", description: null } as never;

function patchReq(body: unknown) {
  return new Request("http://x/api/custom-agents/ca-1", { method: "PATCH", body: JSON.stringify(body) });
}
const delReq = new Request("http://x/api/custom-agents/ca-1", { method: "DELETE" });

beforeEach(() => vi.clearAllMocks());

describe("PATCH /api/custom-agents/[id]", () => {
  test("401 chưa đăng nhập", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await PATCH(patchReq({ name: "x" }), params)).status).toBe(401);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  test("viewer → 403, không update", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "viewer" } } as never);
    expect((await PATCH(patchReq({ name: "x" }), params)).status).toBe(403);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  test("không sở hữu (getCustomAgent null) → 404", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    mockGet.mockResolvedValue(null);
    expect((await PATCH(patchReq({ name: "x" }), params)).status).toBe(404);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  test("name/system rỗng tường minh → 400", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    mockGet.mockResolvedValue(OWNED);
    expect((await PATCH(patchReq({ name: "  " }), params)).status).toBe(400);
    expect((await PATCH(patchReq({ system: "" }), params)).status).toBe(400);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  test("owner sửa name+system → update set đúng field", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    mockGet.mockResolvedValue(OWNED);
    const res = await PATCH(patchReq({ name: "Mới", system: "S2" }), params);
    expect(res.status).toBe(200);
    expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({ name: "Mới", system: "S2" }));
  });

  test("race: row biến mất giữa ownership-check và update (returning rỗng) → 404, không ok giả", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    mockGet.mockResolvedValue(OWNED);
    updateReturningSpy.mockResolvedValueOnce([]);
    expect((await PATCH(patchReq({ name: "Mới" }), params)).status).toBe(404);
  });
});

describe("DELETE /api/custom-agents/[id]", () => {
  test("401 / 403 / 404 — không delete", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await DELETE(delReq, params)).status).toBe(401);
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "viewer" } } as never);
    expect((await DELETE(delReq, params)).status).toBe(403);
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    mockGet.mockResolvedValue(null);
    expect((await DELETE(delReq, params)).status).toBe(404);
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  test("owner xoá → delete chạy, {ok:true}", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    mockGet.mockResolvedValue(OWNED);
    const res = await DELETE(delReq, params);
    expect(res.status).toBe(200);
    expect(deleteSpy).toHaveBeenCalled();
    expect(whereDeleteSpy).toHaveBeenCalled();
  });

  test("race: row đã bị xoá trước (returning rỗng) → 404", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    mockGet.mockResolvedValue(OWNED);
    deleteReturningSpy.mockResolvedValueOnce([]);
    expect((await DELETE(delReq, params)).status).toBe(404);
  });
});
