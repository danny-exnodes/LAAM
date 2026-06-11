import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/workflow/validate", () => ({ assertRunnable: vi.fn() }));

import { auth } from "@/auth";
import { assertRunnable } from "@/lib/workflow/validate";

const mockAuth = vi.mocked(auth);
const mockAssertRunnable = vi.mocked(assertRunnable);

// Build a reusable fake db
function fakeDb(wfRow: unknown) {
  const updatedSets: unknown[] = [];
  const db = {
    _refetchRow: wfRow, // mutable so tests can override after update
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (db._refetchRow ? [db._refetchRow] : []),
        }),
      }),
    }),
    update: () => ({
      set: (patch: unknown) => ({
        where: async () => {
          updatedSets.push(patch);
          // Merge patch into the stored row for re-fetch simulation
          if (db._refetchRow && typeof db._refetchRow === "object") {
            Object.assign(db._refetchRow as object, patch);
          }
        },
      }),
    }),
  };
  return { db, updatedSets };
}

let _db: ReturnType<typeof fakeDb>["db"];
vi.mock("@/db", () => ({
  get db() {
    return _db;
  },
}));
vi.mock("@/db/schema", () => ({
  workflows: Object.assign({}, { [Symbol.for("drizzle:Name")]: "workflow" }),
}));

import { GET, PATCH, DELETE } from "./route";

const baseWf = {
  id: "wf1",
  userId: "u1",
  name: "My Workflow",
  description: null,
  graph: { nodes: [{ id: "n1", kind: "agent", prompt: "hello" }], edges: [] },
  isTemplate: false,
  status: "active",
  version: 1,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const validGraph = {
  nodes: [{ id: "n1", kind: "agent" as const, prompt: "hi" }],
  edges: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── GET ────────────────────────────────────────────────────────────────────

describe("GET /api/workflows/[id]", () => {
  test("401 khi chưa đăng nhập", async () => {
    mockAuth.mockResolvedValue(null as never);
    const { db } = fakeDb(null);
    _db = db as never;
    const res = await GET(new Request("http://x"), {
      params: Promise.resolve({ id: "wf1" }),
    });
    expect(res.status).toBe(401);
  });

  test("200 trả về workflow của mình", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const { db } = fakeDb({ ...baseWf });
    _db = db as never;
    const res = await GET(new Request("http://x"), {
      params: Promise.resolve({ id: "wf1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as typeof baseWf;
    expect(body.id).toBe("wf1");
    expect(body.name).toBe("My Workflow");
  });

  test("404 khi workflow không tồn tại", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const { db } = fakeDb(null);
    _db = db as never;
    const res = await GET(new Request("http://x"), {
      params: Promise.resolve({ id: "nope" }),
    });
    expect(res.status).toBe(404);
  });

  test("404 khi workflow thuộc user khác", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const { db } = fakeDb({ ...baseWf, userId: "u2" });
    _db = db as never;
    const res = await GET(new Request("http://x"), {
      params: Promise.resolve({ id: "wf1" }),
    });
    expect(res.status).toBe(404);
  });
});

// ─── PATCH ──────────────────────────────────────────────────────────────────

describe("PATCH /api/workflows/[id]", () => {
  test("401 khi chưa đăng nhập", async () => {
    mockAuth.mockResolvedValue(null as never);
    const { db } = fakeDb(null);
    _db = db as never;
    const res = await PATCH(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({ name: "New" }),
      }),
      { params: Promise.resolve({ id: "wf1" }) },
    );
    expect(res.status).toBe(401);
  });

  test("404 khi workflow của user khác", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const { db } = fakeDb({ ...baseWf, userId: "u2" });
    _db = db as never;
    const res = await PATCH(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({ name: "Hack" }),
      }),
      { params: Promise.resolve({ id: "wf1" }) },
    );
    expect(res.status).toBe(404);
  });

  test("cập nhật name thành công", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const { db, updatedSets } = fakeDb({ ...baseWf });
    _db = db as never;
    const res = await PATCH(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({ name: "Workflow mới" }),
      }),
      { params: Promise.resolve({ id: "wf1" }) },
    );
    expect(res.status).toBe(200);
    expect(updatedSets).toHaveLength(1);
    const patch = updatedSets[0] as { name: string };
    expect(patch.name).toBe("Workflow mới");
  });

  test("PATCH với graph hợp lệ — gọi assertRunnable + cập nhật", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    mockAssertRunnable.mockReturnValue(undefined); // does not throw
    const { db, updatedSets } = fakeDb({ ...baseWf });
    _db = db as never;
    const res = await PATCH(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({ graph: validGraph }),
      }),
      { params: Promise.resolve({ id: "wf1" }) },
    );
    expect(mockAssertRunnable).toHaveBeenCalledWith(validGraph);
    expect(res.status).toBe(200);
    const patch = updatedSets[0] as { graph: typeof validGraph };
    expect(patch.graph).toEqual(validGraph);
  });

  test("PATCH graph không hợp lệ → 400", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    mockAssertRunnable.mockImplementation(() => {
      throw new Error("validate: trùng node id");
    });
    const { db } = fakeDb({ ...baseWf });
    _db = db as never;
    const res = await PATCH(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({ graph: { nodes: [], edges: [] } }),
      }),
      { params: Promise.resolve({ id: "wf1" }) },
    );
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("validate:");
  });

  test("PATCH không có graph — assertRunnable không được gọi", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const { db } = fakeDb({ ...baseWf });
    _db = db as never;
    await PATCH(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({ name: "Only name change" }),
      }),
      { params: Promise.resolve({ id: "wf1" }) },
    );
    expect(mockAssertRunnable).not.toHaveBeenCalled();
  });
});

// ─── RBAC: viewer is read-only ────────────────────────────────────────────────

describe("viewer is blocked from mutating a workflow", () => {
  test("PATCH viewer → 403, validate/update never run", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "viewer" } } as never);
    const { db, updatedSets } = fakeDb({ ...baseWf });
    _db = db as never;
    const res = await PATCH(
      new Request("http://x", { method: "PATCH", body: JSON.stringify({ name: "Hack" }) }),
      { params: Promise.resolve({ id: "wf1" }) },
    );
    expect(res.status).toBe(403);
    expect(mockAssertRunnable).not.toHaveBeenCalled();
    expect(updatedSets).toHaveLength(0); // no side effect
  });

  test("DELETE viewer → 403, workflow never deleted", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "viewer" } } as never);
    let deleted = false;
    _db = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [baseWf] }) }) }),
      delete: () => ({ where: async () => { deleted = true; } }),
    } as never;
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), {
      params: Promise.resolve({ id: "wf1" }),
    });
    expect(res.status).toBe(403);
    expect(deleted).toBe(false); // no side effect — the gate fires before db.delete
  });
});
