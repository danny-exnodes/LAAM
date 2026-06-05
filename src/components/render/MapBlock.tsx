"use client";

// Renders a v1-style ```map fenced block (Leaflet JSON) — see public/chat-render.js
// (buildMap) and public/chat-geo.js for the schema. The leaflet render itself is
// loaded via next/dynamic({ssr:false}) so it never executes during SSR/next build.

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  needsResolution,
  resolveMapSpec,
  type GeoDeps,
  type MapSpec,
} from "@/lib/chat/geo-resolve";
import { looseJsonParse } from "@/lib/chat/loose-json";

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
  const cfg = looseJsonParse(raw); // S5: tolerate trailing commas / smart quotes / fences
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

// Browser implementation of the geo deps — calls the existing keyless endpoints
// (the resolver's pure logic lives in @/lib/chat/geo-resolve). All fail-soft:
// a failed lookup returns null so the map still renders what it can.
const browserGeoDeps: GeoDeps = {
  async geocode(q) {
    try {
      const r = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      if (!r.ok) return null;
      const d = await r.json();
      return typeof d?.lat === "number" && typeof d?.lng === "number" ? d : null;
    } catch {
      return null;
    }
  },
  async route(from, to) {
    try {
      const qs = `from=${from[0]},${from[1]}&to=${to[0]},${to[1]}`;
      const r = await fetch(`/api/route?${qs}`);
      if (!r.ok) return null;
      const d = await r.json();
      return Array.isArray(d?.geometry) ? d : null;
    } catch {
      return null;
    }
  },
  async nearby(lat, lng, query) {
    try {
      const qs = `lat=${lat}&lng=${lng}&q=${encodeURIComponent(query)}`;
      const r = await fetch(`/api/nearby?${qs}`);
      if (!r.ok) return null;
      const d = await r.json();
      return Array.isArray(d?.results) ? d : { results: [] };
    } catch {
      return null;
    }
  },
  geolocate() {
    return new Promise((resolve) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 8000, maximumAge: 60_000 },
      );
    });
  },
};

function safeParseSpec(raw: string): MapSpec | null {
  const o = looseJsonParse(raw);
  return o && typeof o === "object" ? (o as MapSpec) : null;
}

// Render-only: takes an already-resolved config and draws the map + chrome.
function MapView({ cfg, onRetry }: { cfg: MapConfig; onRetry?: () => void }) {
  return (
    <div className="chat-map-wrap">
      <LeafletMap config={cfg} />
      {cfg.googleUrl ? (
        <a className="chat-map-link" href={cfg.googleUrl} target="_blank" rel="noopener noreferrer nofollow">
          Mở Google Maps
        </a>
      ) : null}
      {cfg.locationDenied ? (
        <div className="chat-map-note">
          Không lấy được vị trí của bạn.{" "}
          {/* S6: retry after the user grants location permission */}
          {onRetry ? (
            <button type="button" onClick={onRetry} className="underline">
              Thử lại
            </button>
          ) : null}
        </div>
      ) : null}
      {cfg.routeStraight ? <div className="chat-map-note">Tuyến đường gần đúng (đường thẳng).</div> : null}
      {cfg.nearbyEmpty ? <div className="chat-map-note">Không tìm thấy địa điểm nào quanh đây.</div> : null}
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

export function MapBlock({ raw }: { raw: string }) {
  // A name-based spec ({directions}/{nearby}/{place}) is resolved client-side into
  // real coordinates + a route polyline before rendering (F2). An explicit-coord
  // spec renders immediately. `raw` is stable once the streamed fence closes, so
  // the resolve effect runs once per block (invalid partial JSON never resolves).
  const spec = useMemo(() => safeParseSpec(raw), [raw]);
  const requiresResolve = !!spec && needsResolution(spec);
  const [resolvedRaw, setResolvedRaw] = useState<string | null>(null);
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [retry, setRetry] = useState(0); // S5: re-run geo-resolve on demand (transient failures)

  useEffect(() => {
    if (!requiresResolve || !spec) return;
    let cancelled = false;
    setPhase("loading");
    setResolvedRaw(null);
    resolveMapSpec(spec, browserGeoDeps)
      .then((r) => {
        if (cancelled) return;
        if ("error" in r) {
          setPhase("error");
        } else {
          setResolvedRaw(JSON.stringify(r));
          setPhase("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, [raw, requiresResolve, spec, retry]);

  if (requiresResolve) {
    if (phase === "error") {
      return (
        <div className="chat-block-error">
          Không dựng được bản đồ.{" "}
          <button type="button" onClick={() => setRetry((r) => r + 1)} className="underline">
            Thử lại
          </button>
        </div>
      );
    }
    if (phase === "loading" || !resolvedRaw) {
      return (
        <div className="chat-map" style={{ height: 320, display: "grid", placeItems: "center" }}>
          <span className="text-sm text-neutral-400">Đang dựng bản đồ…</span>
        </div>
      );
    }
    const cfg = parseMapConfig(resolvedRaw);
    if ("error" in cfg) return <div className="chat-block-error">Bản đồ không hợp lệ.</div>;
    return <MapView cfg={cfg} onRetry={() => setRetry((r) => r + 1)} />;
  }

  const cfg = parseMapConfig(raw);
  if ("error" in cfg) {
    return <div className="chat-block-error">Bản đồ không hợp lệ.</div>;
  }
  return <MapView cfg={cfg} />;
}
