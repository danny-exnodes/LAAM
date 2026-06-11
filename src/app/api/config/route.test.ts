import { afterEach, describe, expect, test, vi } from "vitest";

// Hoisted mock state shared with the module mocks below (mirrors
// src/app/api/stats/route.test.ts).
const h = vi.hoisted(() => ({
  authResult: null as { user?: { id: string } } | null,
}));

vi.mock("@/auth", () => ({ auth: vi.fn(async () => h.authResult) }));

import { GET, readStuckMin } from "./route";

afterEach(() => {
  h.authResult = null;
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("GET /api/config", () => {
  test("401 when unauthenticated — config is session-protected, not public", async () => {
    h.authResult = null;
    const res = await GET();
    expect(res.status).toBe(401);
  });

  test("returns env LAAM_STUCK_MIN so deployments can tune the stuck threshold", async () => {
    h.authResult = { user: { id: "u1" } };
    vi.stubEnv("LAAM_STUCK_MIN", "25");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stuckMin: 25 });
  });

  test("defaults to 10 (v1 behaviour) when the env var is unset", async () => {
    h.authResult = { user: { id: "u1" } };
    vi.stubEnv("LAAM_STUCK_MIN", "");
    const res = await GET();
    expect(await res.json()).toEqual({ stuckMin: 10 });
  });
});

describe("readStuckMin", () => {
  test("non-numeric values fall back to the default instead of breaking stuck detection", () => {
    expect(readStuckMin("banana")).toBe(10);
    expect(readStuckMin(undefined)).toBe(10);
  });

  test("clamps to 1..120 so a typo cannot disable alerts (0) or make them never fire (huge)", () => {
    expect(readStuckMin("0")).toBe(1);
    expect(readStuckMin("-5")).toBe(1);
    expect(readStuckMin("9999")).toBe(120);
    expect(readStuckMin("120")).toBe(120);
    expect(readStuckMin("1")).toBe(1);
  });
});
