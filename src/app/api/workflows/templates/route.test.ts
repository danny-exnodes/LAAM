import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import { GET } from "./route";
import { TEMPLATES } from "@/lib/workflow/templates";

const mockAuth = vi.mocked(auth);

beforeEach(() => {
  vi.clearAllMocks();
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
