import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

// POST inserts a workflow row; track inserts so we can assert "no write" for a viewer.
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

import { auth } from "@/auth";
import { GET, POST } from "./route";
import { TEMPLATES } from "@/lib/workflow/templates";

const mockAuth = vi.mocked(auth);

beforeEach(() => {
  vi.clearAllMocks();
  insertedRows.length = 0;
});

describe("GET /api/workflows/templates", () => {
  test("401 khi chưa đăng nhập", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  test("trả về danh sách templates (không có graph)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json() as { id: string; name: string; description: string; moatLeaning: boolean }[];
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(TEMPLATES.length);
    // Check fields present and no graph exposed
    for (const item of data) {
      expect(item.id).toBeTruthy();
      expect(item.name).toBeTruthy();
      expect(item.description).toBeTruthy();
      expect(typeof item.moatLeaning).toBe("boolean");
      // graph should NOT be in list response
      expect((item as Record<string, unknown>).graph).toBeUndefined();
    }
  });

  test("≥2 items moatLeaning=true", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    const res = await GET();
    const data = await res.json() as { moatLeaning: boolean }[];
    expect(data.filter((t) => t.moatLeaning).length).toBeGreaterThanOrEqual(2);
  });
});

describe("POST /api/workflows/templates — RBAC (instantiate inserts a workflow)", () => {
  const validTemplateId = TEMPLATES[0].id;
  function req(body: unknown) {
    return new Request("http://x", { method: "POST", body: JSON.stringify(body) });
  }

  test("401 khi chưa đăng nhập — không insert", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await POST(req({ templateId: validTemplateId }));
    expect(res.status).toBe(401);
    expect(insertedRows).toHaveLength(0);
  });

  test("viewer → 403, no workflow row inserted", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "viewer" } } as never);
    const res = await POST(req({ templateId: validTemplateId }));
    expect(res.status).toBe(403);
    expect(insertedRows).toHaveLength(0);
  });

  test("member → instantiates template (201, row inserted)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const res = await POST(req({ templateId: validTemplateId }));
    expect(res.status).toBe(201);
    expect(insertedRows).toHaveLength(1);
    expect((insertedRows[0] as { userId: string }).userId).toBe("u1");
  });
});
