import { afterEach, describe, expect, test, vi } from "vitest";

const h = vi.hoisted(() => ({
  authResult: null as { user?: { id: string } } | null,
}));

vi.mock("@/auth", () => ({ auth: vi.fn(async () => h.authResult) }));

import { GET } from "./route";

afterEach(() => {
  h.authResult = null;
  vi.clearAllMocks();
});

describe("GET /api/chat/info", () => {
  test("401 when unauthenticated", async () => {
    h.authResult = null;
    const res = await GET();
    expect(res.status).toBe(401);
  });

  test("200 returns the default chat model", async () => {
    h.authResult = { user: { id: "u1" } };
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.model).toBe("string");
    expect(body.model.length).toBeGreaterThan(0);
  });
});
