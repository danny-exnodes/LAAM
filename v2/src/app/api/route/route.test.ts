import { afterEach, describe, expect, test, vi } from "vitest";

const h = vi.hoisted(() => ({
  authResult: null as { user?: { id: string } } | null,
}));

vi.mock("@/auth", () => ({ auth: vi.fn(async () => h.authResult) }));

import { GET } from "./route";

function req(qs: string) {
  return new Request("http://test/api/route?" + qs);
}

afterEach(() => {
  h.authResult = null;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("GET /api/route", () => {
  test("401 when unauthenticated", async () => {
    h.authResult = null;
    const res = await GET(req("from=21,105&to=22,106"));
    expect(res.status).toBe(401);
  });

  test("400 when fewer than 2 valid points", async () => {
    h.authResult = { user: { id: "u1" } };
    const res = await GET(req("from=21,105"));
    expect(res.status).toBe(400);
  });

  test("200 returns geometry as [lat,lng] pairs + distance/duration", async () => {
    h.authResult = { user: { id: "u1" } };
    vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({
        routes: [
          {
            distance: 1234,
            duration: 567,
            geometry: { coordinates: [[105.1, 21.1], [106.2, 22.2]] },
          },
        ],
      }),
    );
    const res = await GET(req("from=21.1,105.1&to=22.2,106.2&route-test=a"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.geometry).toEqual([[21.1, 105.1], [22.2, 106.2]]); // [lng,lat] -> [lat,lng]
    expect(body.distance).toBe(1234);
    expect(body.duration).toBe(567);
  });

  test("502 when OSRM returns no usable route", async () => {
    h.authResult = { user: { id: "u1" } };
    vi.spyOn(global, "fetch").mockResolvedValue(Response.json({ routes: [] }));
    const res = await GET(req("from=10,10&to=11,11&route-test=b"));
    expect(res.status).toBe(502);
  });
});
