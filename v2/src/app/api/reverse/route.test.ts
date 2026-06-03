import { afterEach, describe, expect, test, vi } from "vitest";

const h = vi.hoisted(() => ({
  authResult: null as { user?: { id: string } } | null,
}));

vi.mock("@/auth", () => ({ auth: vi.fn(async () => h.authResult) }));

import { GET } from "./route";

function req(qs: string) {
  return new Request("http://test/api/reverse?" + qs);
}

afterEach(() => {
  h.authResult = null;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("GET /api/reverse", () => {
  test("401 when unauthenticated", async () => {
    h.authResult = null;
    const res = await GET(req("lat=21&lng=105"));
    expect(res.status).toBe(401);
  });

  test("400 on missing/invalid lat/lng", async () => {
    h.authResult = { user: { id: "u1" } };
    const res = await GET(req("lat=abc"));
    expect(res.status).toBe(400);
  });

  test("200 returns the resolved address", async () => {
    h.authResult = { user: { id: "u1" } };
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({ display_name: "1 Đường ABC, Hà Nội" }),
    );
    const res = await GET(req("lat=21.1111&lng=105.2222"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ address: "1 Đường ABC, Hà Nội", lat: 21.1111, lng: 105.2222 });
    const headers = (spy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["User-Agent"]).toBeTruthy();
  });

  test("404 when no address is found", async () => {
    h.authResult = { user: { id: "u1" } };
    vi.spyOn(global, "fetch").mockResolvedValue(Response.json({}));
    const res = await GET(req("lat=1.2345&lng=2.3456"));
    expect(res.status).toBe(404);
  });
});
