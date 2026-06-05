import { describe, it, expect, vi } from "vitest";
import { needsResolution, resolveMapSpec, type GeoDeps, type MapSpec, type ResolvedMap } from "./geo-resolve";

// Narrow the resolver's `ResolvedMap | {error}` union for the success-path tests.
function ok(r: ResolvedMap | { error: string }): ResolvedMap {
  if ("error" in r) throw new Error("unexpected error: " + r.error);
  return r;
}

// A deterministic fake geo backend. Tests inject exactly what each endpoint
// returns so the resolver's decision tree (route-fail, geocode-fail, denied
// geolocation) is exercised without any real network.
function deps(over: Partial<GeoDeps> = {}): GeoDeps {
  return {
    geocode: vi.fn(async (q: string) =>
      q === "Hồ Gươm"
        ? { lat: 21.0287, lng: 105.8525, display: "Hồ Gươm" }
        : q === "Văn Miếu"
          ? { lat: 21.0294, lng: 105.8355, display: "Văn Miếu" }
          : null,
    ),
    route: vi.fn(async () => ({
      geometry: [
        [21.0287, 105.8525],
        [21.029, 105.844],
        [21.0294, 105.8355],
      ] as [number, number][],
      distance: 2100,
      duration: 600,
    })),
    nearby: vi.fn(async () => ({
      results: [
        { name: "Cafe A", lat: 21.03, lng: 105.85, dist: 120 },
        { name: "Cafe B", lat: 21.031, lng: 105.851, dist: 240 },
      ],
    })),
    geolocate: vi.fn(async () => ({ lat: 21.0, lng: 105.8 })),
    ...over,
  };
}

describe("needsResolution", () => {
  it("is true for name-based specs (directions/nearby/place)", () => {
    expect(needsResolution({ directions: { from: "A", to: "B" } })).toBe(true);
    expect(needsResolution({ nearby: { query: "cà phê" } })).toBe(true);
    expect(needsResolution({ place: "Hồ Gươm" })).toBe(true);
  });
  it("is false for an already-resolved spec (explicit coords)", () => {
    expect(needsResolution({ markers: [{ lat: 1, lng: 2 }] })).toBe(false);
    expect(needsResolution({ center: [1, 2] })).toBe(false);
    expect(needsResolution({})).toBe(false);
  });
});

describe("resolveMapSpec — directions", () => {
  it("geocodes both endpoints, draws the real route, keeps directions for the Google link", async () => {
    const d = deps();
    const r = ok(await resolveMapSpec({ directions: { from: "Hồ Gươm", to: "Văn Miếu" } }, d));
    expect(d.geocode).toHaveBeenCalledTimes(2);
    expect(r.markers).toHaveLength(2);
    expect(r.markers?.[0].label).toBe("Hồ Gươm");
    expect(r.route).toHaveLength(3); // from the route geometry, not the model
    expect(r.routeStraight).toBeFalsy();
    expect(r.directions).toEqual({ from: "Hồ Gươm", to: "Văn Miếu" });
  });

  it("falls back to a straight line when routing fails", async () => {
    const d = deps({ route: vi.fn(async () => null) });
    const r = ok(await resolveMapSpec({ directions: { from: "Hồ Gươm", to: "Văn Miếu" } }, d));
    expect(r.routeStraight).toBe(true);
    expect(r.route).toEqual([
      [21.0287, 105.8525],
      [21.0294, 105.8355],
    ]);
  });

  it("still returns a usable map (Google link) when one endpoint can't be geocoded", async () => {
    const d = deps({ geocode: vi.fn(async (q: string) => (q === "Văn Miếu" ? { lat: 21.0294, lng: 105.8355 } : null)) });
    const r = ok(await resolveMapSpec({ directions: { from: "Nơi lạ", to: "Văn Miếu" } }, d));
    expect(r.route).toBeNull(); // can't route without both ends
    expect(r.markers).toHaveLength(1);
    expect(r.directions).toEqual({ from: "Nơi lạ", to: "Văn Miếu" }); // googleUrl still builds from names
  });
});

describe("resolveMapSpec — nearby", () => {
  it("centers on a named area and lists places", async () => {
    const d = deps();
    const r = ok(await resolveMapSpec({ nearby: { query: "cà phê", near: "Hồ Gươm" } }, d));
    expect(d.geocode).toHaveBeenCalledWith("Hồ Gươm");
    expect(r.center).toEqual([21.0287, 105.8525]);
    expect(r.markers).toHaveLength(2);
    expect(r.places).toEqual([
      { name: "Cafe A", dist: 120 },
      { name: "Cafe B", dist: 240 },
    ]);
  });

  it("uses the browser location when no area is named", async () => {
    const d = deps();
    const r = ok(await resolveMapSpec({ nearby: { query: "cà phê" } }, d));
    expect(d.geolocate).toHaveBeenCalled();
    expect(r.center).toEqual([21.0, 105.8]);
  });

  it("marks locationDenied when geolocation is unavailable and no area is named", async () => {
    const d = deps({ geolocate: vi.fn(async () => null) });
    const r = ok(await resolveMapSpec({ nearby: { query: "cà phê" } }, d));
    expect(r.locationDenied).toBe(true);
  });

  it("flags nearbyEmpty when nothing is found", async () => {
    const d = deps({ nearby: vi.fn(async () => ({ results: [] })) });
    const r = ok(await resolveMapSpec({ nearby: { query: "cà phê", near: "Hồ Gươm" } }, d));
    expect(r.nearbyEmpty).toBe(true);
  });
});

describe("resolveMapSpec — place", () => {
  it("geocodes a single place into a centered marker", async () => {
    const d = deps();
    const r = ok(await resolveMapSpec({ place: "Hồ Gươm" } as MapSpec, d));
    expect(r.center).toEqual([21.0287, 105.8525]);
    expect(r.markers).toEqual([{ lat: 21.0287, lng: 105.8525, label: "Hồ Gươm" }]);
  });

  it("returns an error when the place cannot be found", async () => {
    const d = deps({ geocode: vi.fn(async () => null) });
    const r = await resolveMapSpec({ place: "Nơi không tồn tại" } as MapSpec, d);
    expect("error" in r).toBe(true);
  });
});
