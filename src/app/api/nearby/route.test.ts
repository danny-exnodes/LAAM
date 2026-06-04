import { afterEach, describe, expect, test, vi } from "vitest";

const h = vi.hoisted(() => ({
  authResult: null as { user?: { id: string } } | null,
}));

vi.mock("@/auth", () => ({ auth: vi.fn(async () => h.authResult) }));

import { GET } from "./route";

function req(qs: string) {
  return new Request("http://test/api/nearby?" + qs);
}

afterEach(() => {
  h.authResult = null;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("GET /api/nearby", () => {
  test("401 when unauthenticated", async () => {
    h.authResult = null;
    const res = await GET(req("lat=21&lng=105&q=cafe"));
    expect(res.status).toBe(401);
  });

  test("400 on missing/invalid lat/lng", async () => {
    h.authResult = { user: { id: "u1" } };
    const res = await GET(req("q=cafe"));
    expect(res.status).toBe(400);
  });

  test("200 returns mapped + distance-sorted results for a known category (Overpass)", async () => {
    h.authResult = { user: { id: "u1" } };
    vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({
        elements: [
          { type: "node", lat: 21.001, lon: 105.001, tags: { name: "Far Cafe", amenity: "cafe" } },
          { type: "node", lat: 21.0001, lon: 105.0001, tags: { name: "Near Cafe", amenity: "cafe" } },
          { type: "node", lat: 21.002, lon: 105.002, tags: { amenity: "cafe" } }, // no name → skipped
        ],
      }),
    );
    const res = await GET(req("lat=21&lng=105&q=cafe&nearby-test=overpass"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.center).toEqual({ lat: 21, lng: 105 });
    expect(body.results.map((r: { name: string }) => r.name)).toEqual(["Near Cafe", "Far Cafe"]);
  });

  test("200 falls back to Nominatim viewbox search for an unknown category", async () => {
    h.authResult = { user: { id: "u1" } };
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json([{ display_name: "Some Place, Hanoi", lat: "21.01", lon: "105.01", type: "yes" }]),
    );
    const res = await GET(req("lat=21&lng=105&q=zzz-unknown-category&nearby-test=nominatim"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0].name).toBe("Some Place");
    // Nominatim needs an identifying User-Agent.
    const headers = (spy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["User-Agent"]).toBeTruthy();
  });

  test("502 when the upstream lookup throws", async () => {
    h.authResult = { user: { id: "u1" } };
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("boom"));
    // Distinct coords + category so this misses the module cache populated above.
    const res = await GET(req("lat=30&lng=40&q=bank&nearby-test=throws"));
    expect(res.status).toBe(502);
  });
});
