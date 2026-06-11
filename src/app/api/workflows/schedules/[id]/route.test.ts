import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/workflow/cron", () => ({
  parseCron: vi.fn(),
  nextRunAt: vi.fn(() => new Date("2026-07-01T00:00:00Z")),
}));

import { auth } from "@/auth";
import { parseCron, nextRunAt as cronNext } from "@/lib/workflow/cron";

const mockAuth = vi.mocked(auth);
const mockParseCron = vi.mocked(parseCron);
const mockCronNext = vi.mocked(cronNext);

const baseSchedule = {
  id: "s1",
  workflowId: "wf1",
  userId: "u1",
  cron: "0 8 * * *",
  timezone: "Asia/Ho_Chi_Minh",
  enabled: true,
  nextRunAt: new Date("2026-06-07T01:00:00Z"),
  createdAt: new Date("2026-06-01"),
  updatedAt: new Date("2026-06-01"),
  catchupPolicy: "skip",
  missedCount: 0,
};

function fakeDb(schedRow: unknown) {
  const deletedCount = { n: 0 };
  const updatedSets: unknown[] = [];
  const db = {
    _row: schedRow,
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (db._row ? [db._row] : []),
        }),
      }),
    }),
    delete: () => ({
      where: async () => { deletedCount.n++; },
    }),
    update: () => ({
      set: (patch: unknown) => ({
        where: async () => {
          updatedSets.push(patch);
          if (db._row && typeof db._row === "object")
            Object.assign(db._row as object, patch);
        },
      }),
    }),
  };
  return { db, deletedCount, updatedSets };
}

let _db: ReturnType<typeof fakeDb>["db"];
vi.mock("@/db", () => ({ get db() { return _db; } }));
vi.mock("@/db/schema", () => ({
  workflowSchedules: Object.assign({}, { [Symbol.for("drizzle:Name")]: "workflow_schedule" }),
}));

import { DELETE, PATCH } from "./route";

beforeEach(() => { vi.clearAllMocks(); });

// ── DELETE ────────────────────────────────────────────────────────────────────

describe("DELETE /api/workflows/schedules/[id]", () => {
  test("401 khi chưa đăng nhập", async () => {
    mockAuth.mockResolvedValue(null as never);
    const { db } = fakeDb(null);
    _db = db as never;
    const res = await DELETE(new Request("http://x"), { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(401);
  });

  test("404 khi schedule không tồn tại", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const { db } = fakeDb(null);
    _db = db as never;
    const res = await DELETE(new Request("http://x"), { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(404);
  });

  test("viewer → 403, schedule NOT deleted", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "viewer" } } as never);
    const { db, deletedCount } = fakeDb({ ...baseSchedule });
    _db = db as never;
    const res = await DELETE(new Request("http://x"), { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(403);
    expect(deletedCount.n).toBe(0);
  });

  test("404 khi schedule thuộc user khác", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const { db } = fakeDb({ ...baseSchedule, userId: "u2" });
    _db = db as never;
    const res = await DELETE(new Request("http://x"), { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(404);
  });

  test("204 xoá thành công", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const { db, deletedCount } = fakeDb({ ...baseSchedule });
    _db = db as never;
    const res = await DELETE(new Request("http://x"), { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(204);
    expect(deletedCount.n).toBe(1);
  });
});

// ── PATCH ─────────────────────────────────────────────────────────────────────

describe("PATCH /api/workflows/schedules/[id]", () => {
  test("401 khi chưa đăng nhập", async () => {
    mockAuth.mockResolvedValue(null as never);
    const { db } = fakeDb(null);
    _db = db as never;
    const res = await PATCH(
      new Request("http://x", { method: "PATCH", body: JSON.stringify({ enabled: false }) }),
      { params: Promise.resolve({ id: "s1" }) },
    );
    expect(res.status).toBe(401);
  });

  test("404 khi schedule của user khác", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const { db } = fakeDb({ ...baseSchedule, userId: "u2" });
    _db = db as never;
    const res = await PATCH(
      new Request("http://x", { method: "PATCH", body: JSON.stringify({ enabled: false }) }),
      { params: Promise.resolve({ id: "s1" }) },
    );
    expect(res.status).toBe(404);
  });

  test("viewer → 403, schedule NOT re-enabled (no DB update)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "viewer" } } as never);
    const { db, updatedSets } = fakeDb({ ...baseSchedule, enabled: false });
    _db = db as never;
    const res = await PATCH(
      new Request("http://x", { method: "PATCH", body: JSON.stringify({ enabled: true }) }),
      { params: Promise.resolve({ id: "s1" }) },
    );
    expect(res.status).toBe(403);
    // Load-bearing: arming an autonomous-write schedule must not be possible for a viewer.
    expect(updatedSets).toHaveLength(0);
  });

  test("toggle enabled → cập nhật enabled, KHÔNG gọi parseCron", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const { db, updatedSets } = fakeDb({ ...baseSchedule });
    _db = db as never;
    const res = await PATCH(
      new Request("http://x", { method: "PATCH", body: JSON.stringify({ enabled: false }) }),
      { params: Promise.resolve({ id: "s1" }) },
    );
    expect(res.status).toBe(200);
    expect(mockParseCron).not.toHaveBeenCalled();
    const patch = updatedSets[0] as { enabled: boolean };
    expect(patch.enabled).toBe(false);
  });

  test("đổi cron hợp lệ → gọi parseCron + tính lại nextRunAt", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    mockParseCron.mockReturnValue(undefined as never);
    mockCronNext.mockReturnValue(new Date("2026-07-01T00:00:00Z") as never);
    const { db, updatedSets } = fakeDb({ ...baseSchedule });
    _db = db as never;
    const res = await PATCH(
      new Request("http://x", { method: "PATCH", body: JSON.stringify({ cron: "0 9 * * *" }) }),
      { params: Promise.resolve({ id: "s1" }) },
    );
    expect(res.status).toBe(200);
    expect(mockParseCron).toHaveBeenCalledWith("0 9 * * *");
    const patch = updatedSets[0] as { cron: string; nextRunAt: Date };
    expect(patch.cron).toBe("0 9 * * *");
    expect(patch.nextRunAt).toEqual(new Date("2026-07-01T00:00:00Z"));
  });

  test("cron không hợp lệ → 400", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    mockParseCron.mockImplementation(() => { throw new Error("invalid cron"); });
    const { db } = fakeDb({ ...baseSchedule });
    _db = db as never;
    const res = await PATCH(
      new Request("http://x", { method: "PATCH", body: JSON.stringify({ cron: "bad cron" }) }),
      { params: Promise.resolve({ id: "s1" }) },
    );
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("invalid cron");
  });

  test("400 khi body rỗng (không có trường nào)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const { db } = fakeDb({ ...baseSchedule });
    _db = db as never;
    const res = await PATCH(
      new Request("http://x", { method: "PATCH", body: JSON.stringify({}) }),
      { params: Promise.resolve({ id: "s1" }) },
    );
    expect(res.status).toBe(400);
  });

  test("cron hợp lệ cú pháp nhưng cronNext ném → 400", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    mockParseCron.mockReturnValue(undefined as never); // parseCron passes
    mockCronNext.mockImplementation(() => { throw new Error("cannot find next run"); });
    const { db } = fakeDb({ ...baseSchedule });
    _db = db as never;
    const res = await PATCH(
      new Request("http://x", { method: "PATCH", body: JSON.stringify({ cron: "0 0 29 2 *" }) }),
      { params: Promise.resolve({ id: "s1" }) },
    );
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("cannot find next run");
  });
});
