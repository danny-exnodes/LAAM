// PATCH /api/workflows/runs/[id] { action: "cancel" } — W4 cancel-run.
// Ý nghĩa: chỉ CHỦ run hủy được (404 như GET — không lộ run người khác); chỉ run
// queued|running hủy được (409 nếu đã kết thúc); cancel set status+finishedAt và
// phát SSE để UI cập nhật ngay. Engine dừng qua shouldStop (test ở run.test.ts).
import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/events-bus", () => ({ publish: vi.fn() }));

import { auth } from "@/auth";
import { publish } from "@/lib/events-bus";

const mockAuth = vi.mocked(auth);
const mockPublish = vi.mocked(publish);

// fake db: select → run row (mutable); update.set().where() ghi patch + merge vào row
// (mô phỏng re-fetch sau update). mergeOnUpdate=false mô phỏng guard đua (update no-op).
function fakeDb(runRow: Record<string, unknown> | null, opts?: { mergeOnUpdate?: boolean }) {
  const updatedSets: Record<string, unknown>[] = [];
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (runRow ? [runRow] : []),
          orderBy: async () => [],
        }),
      }),
    }),
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: async () => {
          updatedSets.push(patch);
          if (runRow && (opts?.mergeOnUpdate ?? true)) Object.assign(runRow, patch);
        },
      }),
    }),
  };
  return { db, updatedSets };
}

let _db: unknown;
vi.mock("@/db", () => ({
  get db() {
    return _db;
  },
}));

import { PATCH } from "./route";

function mkRun(over: Record<string, unknown> = {}) {
  return {
    id: "r1",
    workflowId: "wf1",
    userId: "u1",
    trigger: "manual",
    status: "running",
    dryRun: false,
    graphSnapshot: { nodes: [], edges: [] },
    context: null,
    error: null,
    scheduleId: null,
    scheduledFor: null,
    startedAt: new Date("2026-01-01T09:00:00Z"),
    finishedAt: null,
    createdAt: new Date("2026-01-01"),
    ...over,
  };
}

function patchReq(body: unknown = { action: "cancel" }) {
  return new Request("http://x", { method: "PATCH", body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/workflows/runs/[id] — cancel", () => {
  test("401 khi chưa đăng nhập", async () => {
    mockAuth.mockResolvedValue(null as never);
    _db = fakeDb(null).db;
    const res = await PATCH(patchReq(), { params: Promise.resolve({ id: "r1" }) });
    expect(res.status).toBe(401);
  });

  test("viewer → 403, run NOT cancelled (no status/finishedAt mutation)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "viewer" } } as never);
    const { db, updatedSets } = fakeDb(mkRun({ status: "running" }));
    _db = db;
    const res = await PATCH(patchReq(), { params: Promise.resolve({ id: "r1" }) });
    expect(res.status).toBe(403);
    // Load-bearing: a read-only viewer cannot mutate run state.
    expect(updatedSets).toHaveLength(0);
    expect(mockPublish).not.toHaveBeenCalled();
  });

  test("404 khi run thuộc user khác — KHÔNG update gì", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const { db, updatedSets } = fakeDb(mkRun({ userId: "u2" }));
    _db = db;
    const res = await PATCH(patchReq(), { params: Promise.resolve({ id: "r1" }) });
    expect(res.status).toBe(404);
    expect(updatedSets).toHaveLength(0);
    expect(mockPublish).not.toHaveBeenCalled();
  });

  test("404 khi run không tồn tại", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    _db = fakeDb(null).db;
    const res = await PATCH(patchReq(), { params: Promise.resolve({ id: "nope" }) });
    expect(res.status).toBe(404);
  });

  test("400 khi action khác 'cancel'", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const { db, updatedSets } = fakeDb(mkRun());
    _db = db;
    const res = await PATCH(patchReq({ action: "pause" }), { params: Promise.resolve({ id: "r1" }) });
    expect(res.status).toBe(400);
    expect(updatedSets).toHaveLength(0);
  });

  test("409 khi run đã kết thúc (succeeded)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const { db, updatedSets } = fakeDb(mkRun({ status: "succeeded", finishedAt: new Date() }));
    _db = db;
    const res = await PATCH(patchReq(), { params: Promise.resolve({ id: "r1" }) });
    expect(res.status).toBe(409);
    expect(updatedSets).toHaveLength(0);
    expect(mockPublish).not.toHaveBeenCalled();
  });

  test("200 cancel run đang chạy → status cancelled + finishedAt + SSE", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const { db, updatedSets } = fakeDb(mkRun({ status: "running" }));
    _db = db;
    const res = await PATCH(patchReq(), { params: Promise.resolve({ id: "r1" }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { run: { status: string; finishedAt: string | null } };
    expect(body.run.status).toBe("cancelled");
    expect(body.run.finishedAt).not.toBeNull();
    const patch = updatedSets[0] as { status: string; finishedAt: Date };
    expect(patch.status).toBe("cancelled");
    expect(patch.finishedAt).toBeInstanceOf(Date);
    expect(mockPublish).toHaveBeenCalledWith({ type: "workflow_run", runId: "r1", status: "cancelled" });
  });

  test("200 cancel run đang chờ (queued)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const { db } = fakeDb(mkRun({ status: "queued", startedAt: null }));
    _db = db;
    const res = await PATCH(patchReq(), { params: Promise.resolve({ id: "r1" }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { run: { status: string } };
    expect(body.run.status).toBe("cancelled");
  });

  // A crashed run waiting for tick-resume is 'resumable' — it has NOT ended (tickResume
  // will revive it), so the user MUST be able to stop it. Cancelling before the claim
  // wins because tickResume only claims status='resumable'.
  test("200 cancel run 'resumable' (crash chờ tick-resume) → cancelled, không hồi sinh", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const { db, updatedSets } = fakeDb(mkRun({ status: "resumable" }));
    _db = db;
    const res = await PATCH(patchReq(), { params: Promise.resolve({ id: "r1" }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { run: { status: string } };
    expect(body.run.status).toBe("cancelled");
    expect((updatedSets[0] as { status: string }).status).toBe("cancelled");
    expect(mockPublish).toHaveBeenCalledWith({ type: "workflow_run", runId: "r1", status: "cancelled" });
  });

  test("409 khi run finalize đua giữa select↔update (guard re-check)", async () => {
    // update có điều kiện không khớp nữa (run vừa succeeded) → row không đổi → 409.
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const { db } = fakeDb(mkRun({ status: "running" }), { mergeOnUpdate: false });
    _db = db;
    const res = await PATCH(patchReq(), { params: Promise.resolve({ id: "r1" }) });
    expect(res.status).toBe(409);
    expect(mockPublish).not.toHaveBeenCalled();
  });
});
