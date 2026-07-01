import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auth BEFORE importing the route (session-gated handler)
vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1" } })) }));

import { GET } from "./route";

describe("GET /api/weather", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("400s on missing coords", async () => {
    const res = await GET(new Request("http://x/api/weather"));
    expect(res.status).toBe(400);
  });

  it("maps Open-Meteo current weather to {tempC, code}", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ current: { temperature_2m: 31.4, weather_code: 3 } }),
      }) as unknown as Response),
    );
    const res = await GET(new Request("http://x/api/weather?lat=10.7&lng=106.7"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tempC: 31, code: 3 });
  });
});
