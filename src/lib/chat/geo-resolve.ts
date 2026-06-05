// F2 — client-side geo resolution for ```map blocks. The model emits a short,
// NAME-BASED spec ({directions:{from,to}} / {nearby:{query,near}} / {place}); this
// resolves it into a render-ready map config (markers + a real route polyline)
// by calling the existing /api/geocode|route|nearby endpoints. The model never
// reproduces coordinates or the route line (Rule 13) — it only names places.
//
// PURE: all network/geolocation is injected via `deps`, so the decision tree is
// unit-testable. The browser implementation of `deps` lives in MapBlock.

export type GeoHit = { lat: number; lng: number; display?: string };
export type RouteHit = { geometry: [number, number][]; distance?: number; duration?: number };
export type NearbyHit = { results: { name: string; lat: number; lng: number; dist?: number }[] };

export type GeoDeps = {
  geocode: (q: string) => Promise<GeoHit | null>;
  route: (from: [number, number], to: [number, number]) => Promise<RouteHit | null>;
  nearby: (lat: number, lng: number, query: string) => Promise<NearbyHit | null>;
  geolocate?: () => Promise<{ lat: number; lng: number } | null>;
};

// The name-based intent the model emits, plus the explicit pass-through fields
// already understood by parseMapConfig.
export type MapSpec = {
  directions?: { from?: string; to?: string };
  nearby?: { query?: string; near?: string };
  place?: string;
  center?: [number, number];
  zoom?: number;
  markers?: { lat: number; lng: number; label?: string }[];
  route?: [number, number][];
};

// The render-ready shape parseMapConfig consumes (a superset of MapSpec).
export type ResolvedMap = {
  center?: [number, number];
  zoom?: number;
  markers?: { lat: number; lng: number; label?: string }[];
  route?: [number, number][] | null;
  directions?: { from?: string; to?: string };
  routeStraight?: boolean;
  locationDenied?: boolean;
  places?: { name: string; dist?: number }[];
  nearbyEmpty?: boolean;
};

// Only specs that name a place need an async round-trip. Explicit coordinate
// specs (markers/center/route already present) render directly.
export function needsResolution(spec: MapSpec): boolean {
  return !!(
    (spec.directions && (spec.directions.from || spec.directions.to)) ||
    (spec.nearby && spec.nearby.query) ||
    spec.place
  );
}

export async function resolveMapSpec(
  spec: MapSpec,
  deps: GeoDeps,
): Promise<ResolvedMap | { error: string }> {
  if (spec.directions && (spec.directions.from || spec.directions.to)) {
    return resolveDirections(spec.directions, deps);
  }
  if (spec.nearby && spec.nearby.query) {
    return resolveNearby(spec.nearby, deps);
  }
  if (spec.place) {
    return resolvePlace(spec.place, deps);
  }
  // Nothing name-based: hand the explicit fields straight through.
  return { center: spec.center, zoom: spec.zoom, markers: spec.markers, route: spec.route ?? null };
}

async function resolveDirections(
  dir: { from?: string; to?: string },
  deps: GeoDeps,
): Promise<ResolvedMap> {
  const [fromHit, toHit] = await Promise.all([
    dir.from ? deps.geocode(dir.from) : Promise.resolve(null),
    dir.to ? deps.geocode(dir.to) : Promise.resolve(null),
  ]);
  const markers: ResolvedMap["markers"] = [];
  if (fromHit) markers.push({ lat: fromHit.lat, lng: fromHit.lng, label: dir.from });
  if (toHit) markers.push({ lat: toHit.lat, lng: toHit.lng, label: dir.to });

  let route: [number, number][] | null = null;
  let routeStraight = false;
  if (fromHit && toHit) {
    const r = await deps.route([fromHit.lat, fromHit.lng], [toHit.lat, toHit.lng]);
    if (r && r.geometry.length > 1) {
      route = r.geometry;
    } else {
      // Routing failed — draw an approximate straight line so a path still shows.
      route = [
        [fromHit.lat, fromHit.lng],
        [toHit.lat, toHit.lng],
      ];
      routeStraight = true;
    }
  }
  return {
    markers,
    route,
    routeStraight,
    directions: dir, // keep names so the keyless Google Maps directions link still builds
    center: fromHit ? [fromHit.lat, fromHit.lng] : toHit ? [toHit.lat, toHit.lng] : undefined,
    zoom: 13,
  };
}

async function resolveNearby(
  near: { query?: string; near?: string },
  deps: GeoDeps,
): Promise<ResolvedMap> {
  const query = near.query ?? "";
  let center: { lat: number; lng: number } | null = null;
  if (near.near) {
    center = await deps.geocode(near.near);
  } else if (deps.geolocate) {
    center = await deps.geolocate();
  }
  if (!center) {
    // No usable center → tell the UI location is unavailable.
    return { locationDenied: true, markers: [], zoom: 13 };
  }
  const hit = await deps.nearby(center.lat, center.lng, query);
  const results = hit?.results ?? [];
  return {
    center: [center.lat, center.lng],
    zoom: 15,
    markers: results.map((r) => ({ lat: r.lat, lng: r.lng, label: r.name })),
    places: results.map((r) => ({ name: r.name, dist: r.dist })),
    nearbyEmpty: results.length === 0,
  };
}

async function resolvePlace(place: string, deps: GeoDeps): Promise<ResolvedMap | { error: string }> {
  const hit = await deps.geocode(place);
  if (!hit) return { error: "không tìm thấy địa điểm" };
  return {
    center: [hit.lat, hit.lng],
    zoom: 15,
    markers: [{ lat: hit.lat, lng: hit.lng, label: place }],
  };
}
