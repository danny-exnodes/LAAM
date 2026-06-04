"use client";

// Renders a v1-style ```map fenced block (Leaflet JSON) — see public/chat-render.js
// (buildMap) and public/chat-geo.js for the schema. The leaflet render itself is
// loaded via next/dynamic({ssr:false}) so it never executes during SSR/next build.

import dynamic from "next/dynamic";

const HANOI: [number, number] = [21.0278, 105.8342];

type RawMarker = { lat?: unknown; lng?: unknown; label?: string; name?: string };

export type MapConfig = {
  center: [number, number];
  zoom: number;
  markers: { lat: number; lng: number; label?: string }[];
  route: [number, number][] | null;
  googleUrl: string | null;
  locationDenied?: boolean;
  routeStraight?: boolean;
  places?: { name: string; dist?: number }[];
  nearbyEmpty?: boolean;
};

function finite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

// Keyless Google Maps URL — same scheme as v1 buildGoogleMapsUrl (no API key).
export function buildGoogleMapsUrl(cfg: {
  directions?: { from?: string; to?: string };
  center?: [number, number];
  markers?: RawMarker[];
}): string | null {
  const enc = encodeURIComponent;
  const dir = cfg.directions;
  if (dir && dir.from && dir.to) {
    return "https://www.google.com/maps/dir/?api=1&origin=" + enc(dir.from) + "&destination=" + enc(dir.to);
  }
  const pts = (cfg.markers || []).filter((m) => finite(m.lat) && finite(m.lng)) as { lat: number; lng: number }[];
  if (pts.length >= 2) {
    const o = pts[0];
    const d = pts[pts.length - 1];
    return "https://www.google.com/maps/dir/?api=1&origin=" + enc(o.lat + "," + o.lng) + "&destination=" + enc(d.lat + "," + d.lng);
  }
  if (pts.length === 1) {
    return "https://www.google.com/maps/search/?api=1&query=" + enc(pts[0].lat + "," + pts[0].lng);
  }
  if (Array.isArray(cfg.center)) {
    return "https://www.google.com/maps/search/?api=1&query=" + enc(cfg.center[0] + "," + cfg.center[1]);
  }
  return null;
}

// Pure: parse + validate v1 map JSON into a render-ready config (or an error).
export function parseMapConfig(raw: string): MapConfig | { error: string } {
  let cfg: unknown;
  try {
    cfg = JSON.parse(raw);
  } catch {
    return { error: "invalid" };
  }
  if (!cfg || typeof cfg !== "object") return { error: "invalid" };
  const c = cfg as {
    center?: unknown;
    zoom?: unknown;
    markers?: RawMarker[];
    route?: unknown;
    directions?: { from?: string; to?: string };
    locationDenied?: boolean;
    routeStraight?: boolean;
    places?: { name: string; dist?: number }[];
    nearbyEmpty?: boolean;
  };

  const markers = (Array.isArray(c.markers) ? c.markers : [])
    .filter((m) => m && finite(m.lat) && finite(m.lng))
    .map((m) => ({ lat: m.lat as number, lng: m.lng as number, label: m.label || m.name }));

  const route = Array.isArray(c.route)
    ? (c.route.filter((p) => Array.isArray(p) && finite(p[0]) && finite(p[1])) as [number, number][])
    : null;

  let center: [number, number] | undefined =
    Array.isArray(c.center) && finite(c.center[0]) && finite(c.center[1])
      ? [c.center[0] as number, c.center[1] as number]
      : undefined;
  if (!center && markers.length) center = [markers[0].lat, markers[0].lng];
  if (!center && route && route.length) center = route[0];
  if (!center) center = HANOI;

  const zoom = finite(c.zoom) ? (c.zoom as number) : 12;

  return {
    center,
    zoom,
    markers,
    route: route && route.length ? route : null,
    googleUrl: buildGoogleMapsUrl({ directions: c.directions, center, markers: c.markers }),
    locationDenied: c.locationDenied,
    routeStraight: c.routeStraight,
    places: Array.isArray(c.places) ? c.places : undefined,
    nearbyEmpty: c.nearbyEmpty,
  };
}

// SSR-safe: leaflet only loads in the browser.
const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => <div className="chat-map" style={{ height: 320 }} />,
});

export function MapBlock({ raw }: { raw: string }) {
  const cfg = parseMapConfig(raw);
  if ("error" in cfg) {
    return <div className="chat-block-error">Bản đồ không hợp lệ.</div>;
  }
  return (
    <div className="chat-map-wrap">
      <LeafletMap config={cfg} />
      {cfg.googleUrl ? (
        <a className="chat-map-link" href={cfg.googleUrl} target="_blank" rel="noopener noreferrer nofollow">
          Mở Google Maps
        </a>
      ) : null}
      {cfg.locationDenied ? <div className="chat-map-note">Không lấy được vị trí của bạn.</div> : null}
      {cfg.routeStraight ? <div className="chat-map-note">Tuyến đường gần đúng (đường thẳng).</div> : null}
      {cfg.places && cfg.places.length ? (
        <ol className="chat-map-places">
          {cfg.places.map((p, i) => (
            <li key={i}>
              <span className="pl-name">{p.name}</span>
              {typeof p.dist === "number" ? (
                <span className="pl-dist">{p.dist >= 1000 ? (p.dist / 1000).toFixed(1) + " km" : p.dist + " m"}</span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
