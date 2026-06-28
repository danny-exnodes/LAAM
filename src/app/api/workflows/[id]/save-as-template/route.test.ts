import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";

function fakeDb(wfRow: unknown) {
  const insertedRows: unknown[] = [];
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => (wfRow ? [wfRow] : []) }) }) }),
    insert: () => ({ values: async (v: unknown) => { insertedRows.push(v); } }),
  };
  return { db, insertedRows };
}

let _db: ReturnType<typeof fakeDb>["db"];
vi.mock("@/db", () => ({ get db() { return _db; } }));
vi.mock("@/db/schema", () => ({
  workflows: Object.assign({}, { [Symbol.for("drizzle:Name")]: "workflow" }),
}));

import { POST } from "./route";

const mockAuth = vi.mocked(auth);
beforeEach(() => vi.clearAllMocks());

const baseGraph = { nodes: [{ id: "n1", kind: "agent", prompt: "hello" }], edges: [] };

describe("POST /api/workflows/[id]/save-as-template", () => {
  test("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const { db } = fakeDb(null);
    _db = db as never;
    const res = await POST(new Request("http://x"), { params: Promise.resolve({ id: "wf1" }) });
    expect(res.status).toBe(401);
  });

  test("viewer → 403, nothing inserted", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "viewer" } } as never);
    const { db, insertedRows } = fakeDb({ id: "wf1", userId: "u1", isTemplate: false, graph: baseGraph, name: "WF" });
    _db = db as never;
    const res = await POST(new Request("http://x"), { params: Promise.resolve({ id: "wf1" }) });
    expect(res.status).toBe(403);
    expect(insertedRows).toHaveLength(0);
  });

  test("404 for someone else's non-template workflow", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const { db } = fakeDb({ id: "wf-other", userId: "u2", isTemplate: false, graph: baseGraph, name: "Other" });
    _db = db as never;
    const res = await POST(new Request("http://x"), { params: Promise.resolve({ id: "wf-other" }) });
    expect(res.status).toBe(404);
  });

  test("saves a NEW template-flagged copy owned by the caller, in draft", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const { db, insertedRows } = fakeDb({ id: "wf1", userId: "u1", isTemplate: false, graph: baseGraph, name: "Báo cáo" });
    _db = db as never;
    const res = await POST(new Request("http://x"), { params: Promise.resolve({ id: "wf1" }) });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string };
    expect(body.id).not.toBe("wf1");

    expect(insertedRows).toHaveLength(1);
    const row = insertedRows[0] as { userId: string; name: string; isTemplate: boolean; status: string; graph: typeof baseGraph };
    expect(row.userId).toBe("u1");
    expect(row.name).toBe("Báo cáo (mẫu)");
    expect(row.isTemplate).toBe(true); // ← the difference from clone
    expect(row.status).toBe("draft");
    expect(row.graph).toEqual(baseGraph);
  });

  test("graph is deep-copied (mutating the template never touches the source)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const original = { nodes: [{ id: "a", kind: "agent", prompt: "x" }], edges: [] };
    const { db, insertedRows } = fakeDb({ id: "wf1", userId: "u1", isTemplate: false, graph: original, name: "T" });
    _db = db as never;
    await POST(new Request("http://x"), { params: Promise.resolve({ id: "wf1" }) });
    const row = insertedRows[0] as { graph: { nodes: { id: string }[] } };
    row.graph.nodes[0].id = "mutated";
    expect(original.nodes[0].id).toBe("a");
  });
});
