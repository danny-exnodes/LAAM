import { afterEach, describe, expect, test, vi } from "vitest";

const h = vi.hoisted(() => ({
  authResult: null as { user?: { id: string } } | null,
}));

vi.mock("@/auth", () => ({ auth: vi.fn(async () => h.authResult) }));

import { GET } from "./route";

function req(qs: string) {
  return new Request("http://test/api/geocode?" + qs);
}

afterEach(() => {
  h.authResult = null;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("GET /api/geocode", () => {
  test("401 when unauthenticated", async () => {
    h.authResult = null;
    const res = await GET(req("q=Hanoi"));
    expect(res.status).toBe(401);
  });

  test("400 when q is missing", async () => {
    h.authResult = { user: { id: "u1" } };
    const res = await GET(req(""));
    expect(res.status).toBe(400);
  });

  test("200 returns lat/lng/display for a found place", async () => {
    h.authResult = { user: { id: "u1" } };
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json([{ lat: "21.0285", lon: "105.8542", display_name: "Hà Nội, Việt Nam" }]),
    );
    const res = await GET(req("q=Ha+Noi+geocode-found"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ lat: 21.0285, lng: 105.8542, display: "Hà Nội, Việt Nam" });
    // Nominatim requires an identifying User-Agent.
    const headers = (spy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["User-Agent"]).toBeTruthy();
  });

  test("404 when no place is found", async () => {
    h.authResult = { user: { id: "u1" } };
    vi.spyOn(global, "fetch").mockResolvedValue(Response.json([]));
    const res = await GET(req("q=nowhere-geocode-missing"));
    expect(res.status).toBe(404);
  });
});
