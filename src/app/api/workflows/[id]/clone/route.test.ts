import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";

// Build a reusable fake db factory (same pattern as run.test.ts fakeDb)
function fakeDb(wfRow: unknown) {
  const insertedRows: unknown[] = [];
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (wfRow ? [wfRow] : []),
        }),
      }),
    }),
    insert: () => ({
      values: async (v: unknown) => {
        insertedRows.push(v);
      },
    }),
  };
  return { db, insertedRows };
}

// We need to inject db at module level — use a module-level variable approach
let _db: ReturnType<typeof fakeDb>["db"];
vi.mock("@/db", () => ({
  get db() {
    return _db;
  },
}));
vi.mock("@/db/schema", () => ({
  workflows: Object.assign({}, { [Symbol.for("drizzle:Name")]: "workflow" }),
}));

import { POST } from "./route";

const mockAuth = vi.mocked(auth);

beforeEach(() => {
  vi.clearAllMocks();
});

const baseGraph = {
  nodes: [{ id: "n1", kind: "agent", prompt: "hello" }],
  edges: [],
};

describe("POST /api/workflows/[id]/clone", () => {
  test("401 khi chưa đăng nhập", async () => {
    mockAuth.mockResolvedValue(null as never);
    const { db } = fakeDb(null);
    _db = db as never;
    const res = await POST(new Request("http://x"), { params: Promise.resolve({ id: "wf1" }) });
    expect(res.status).toBe(401);
  });

  test("404 khi workflow không tồn tại", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    const { db } = fakeDb(null);
    _db = db as never;
    const res = await POST(new Request("http://x"), { params: Promise.resolve({ id: "no-such-wf" }) });
    expect(res.status).toBe(404);
  });

  test("404 khi workflow thuộc user khác VÀ không phải template", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    const { db } = fakeDb({ id: "wf-other", userId: "u2", isTemplate: false, graph: baseGraph, name: "Wf khác" });
    _db = db as never;
    const res = await POST(new Request("http://x"), { params: Promise.resolve({ id: "wf-other" }) });
    expect(res.status).toBe(404);
  });

  test("clone workflow của mình thành công", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    const { db, insertedRows } = fakeDb({
      id: "wf1",
      userId: "u1",
      isTemplate: false,
      graph: baseGraph,
      name: "Workflow gốc",
    });
    _db = db as never;
    const res = await POST(new Request("http://x"), { params: Promise.resolve({ id: "wf1" }) });
    expect(res.status).toBe(201);
    const body = await res.json() as { id: string };
    expect(body.id).toBeTruthy();
    expect(body.id).not.toBe("wf1"); // new id

    expect(insertedRows).toHaveLength(1);
    const row = insertedRows[0] as {
      id: string;
      userId: string;
      name: string;
      isTemplate: boolean;
      status: string;
      graph: typeof baseGraph;
    };
    expect(row.userId).toBe("u1");
    expect(row.name).toBe("Workflow gốc (bản sao)");
    expect(row.isTemplate).toBe(false);
    expect(row.status).toBe("draft");
    expect(row.id).toBe(body.id);
    // graph deep-copied
    expect(row.graph).toEqual(baseGraph);
  });

  test("clone template-flagged workflow của user khác — được phép", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    const { db, insertedRows } = fakeDb({
      id: "wf-tmpl",
      userId: "u99",
      isTemplate: true,
      graph: baseGraph,
      name: "Template công ty",
    });
    _db = db as never;
    const res = await POST(new Request("http://x"), { params: Promise.resolve({ id: "wf-tmpl" }) });
    expect(res.status).toBe(201);
    const row = insertedRows[0] as { userId: string; name: string; isTemplate: boolean };
    expect(row.userId).toBe("u1"); // caller owns the clone
    expect(row.name).toBe("Template công ty (bản sao)");
    expect(row.isTemplate).toBe(false);
  });

  test("graph được deep-copy (mutating clone không ảnh hưởng original)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    const original = { nodes: [{ id: "a", kind: "agent", prompt: "x" }], edges: [] };
    const { db, insertedRows } = fakeDb({
      id: "wf1",
      userId: "u1",
      isTemplate: false,
      graph: original,
      name: "Test",
    });
    _db = db as never;
    await POST(new Request("http://x"), { params: Promise.resolve({ id: "wf1" }) });
    const clonedRow = insertedRows[0] as { graph: { nodes: { id: string }[] } };
    // mutate the clone's graph
    clonedRow.graph.nodes[0].id = "mutated";
    // original should not be affected
    expect(original.nodes[0].id).toBe("a");
  });
});
