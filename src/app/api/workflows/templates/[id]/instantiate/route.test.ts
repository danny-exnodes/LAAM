import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/db/schema", () => ({
  workflows: Object.assign({}, { [Symbol.for("drizzle:Name")]: "workflow" }),
}));

import { auth } from "@/auth";

// We need to intercept db.insert at runtime so we set up the mock before importing
const insertedRows: unknown[] = [];
vi.mock("@/db", () => ({
  db: {
    insert: () => ({
      values: async (v: unknown) => {
        insertedRows.push(v);
      },
    }),
  },
}));

import { POST } from "./route";

const mockAuth = vi.mocked(auth);

beforeEach(() => {
  vi.clearAllMocks();
  insertedRows.length = 0;
});

describe("POST /api/workflows/templates/[id]/instantiate", () => {
  test("401 khi chưa đăng nhập", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await POST(new Request("http://x"), { params: Promise.resolve({ id: "digest-overnight-agents" }) });
    expect(res.status).toBe(401);
  });

  test("404 khi template id không tồn tại", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    const res = await POST(new Request("http://x"), { params: Promise.resolve({ id: "nonexistent-id" }) });
    expect(res.status).toBe(404);
  });

  test("tạo workflow từ template với đúng fields", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    const res = await POST(new Request("http://x"), { params: Promise.resolve({ id: "digest-overnight-agents" }) });
    expect(res.status).toBe(201);
    const body = await res.json() as { id: string };
    expect(body.id).toBeTruthy();

    // Verify the inserted row
    expect(insertedRows).toHaveLength(1);
    const row = insertedRows[0] as {
      id: string;
      userId: string;
      name: string;
      description: string;
      isTemplate: boolean;
      status: string;
      graph: unknown;
    };
    expect(row.userId).toBe("u1");
    expect(row.name).toBe("Digest agent chạy đêm qua");
    expect(row.isTemplate).toBe(false);
    expect(row.status).toBe("draft");
    expect(row.graph).toBeDefined();
    // returned id matches inserted id
    expect(row.id).toBe(body.id);
  });

  test("graph được deep-copy (structuredClone) — mutating returned graph không ảnh hưởng template", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    await POST(new Request("http://x"), { params: Promise.resolve({ id: "flag-stuck-agents" }) });
    const row = insertedRows[0] as { graph: { nodes: { id: string }[] } };
    // Mutate the inserted graph — should not throw or affect the static TEMPLATES
    row.graph.nodes[0].id = "mutated";
    // Import TEMPLATES fresh and check original still intact
    const { TEMPLATES } = await import("@/lib/workflow/templates");
    const tpl = TEMPLATES.find((t) => t.id === "flag-stuck-agents")!;
    expect(tpl.graph.nodes[0].id).not.toBe("mutated");
  });

  test("userId pada row = session user (ownership correct)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-abc" } } as never);
    const res = await POST(new Request("http://x"), { params: Promise.resolve({ id: "summarize-demo-tasks" }) });
    expect(res.status).toBe(201);
    const row = insertedRows[0] as { userId: string };
    expect(row.userId).toBe("user-abc");
  });
});
