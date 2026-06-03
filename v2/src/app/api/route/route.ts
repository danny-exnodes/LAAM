import { NextResponse } from "next/server";
import { auth } from "@/auth";

// Road routing (real driving geometry, keyless) — proxies the public OSRM demo
// server so the browser avoids CORS. Small cache + gentle throttle to respect
// the free service. Fail-soft: a 502 lets the client draw a straight line.
// Ported from v1 (bin/laam.js).

const UA = "LAAM-chat/0.1 (local AI agent monitoring; self-host)";

type Route = { geometry: Array<[number, number]>; distance: number; duration: number };

const routeCache = new Map<string, Route | null>();
let lastRouteCall = 0;

async function routeOne(coords: Array<[number, number]>): Promise<Route | null> {
  const key = coords.map((c) => c.join(",")).join(";");
  if (routeCache.has(key)) return routeCache.get(key) ?? null;
  const wait = Math.max(0, 600 - (Date.now() - lastRouteCall));
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastRouteCall = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const seg = coords.map((c) => c[0] + "," + c[1]).join(";");
    const url =
      "https://router.project-osrm.org/route/v1/driving/" + seg + "?overview=full&geometries=geojson";
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA } });
    clearTimeout(timer);
    const j = (await r.json()) as {
      routes?: Array<{ distance: number; duration: number; geometry?: { coordinates?: number[][] } }>;
    };
    const route = j && Array.isArray(j.routes) ? j.routes[0] : undefined;
    const coordsOut =
      route && route.geometry && Array.isArray(route.geometry.coordinates)
        ? route.geometry.coordinates
        : null;
    const hit: Route | null =
      coordsOut && coordsOut.length > 1
        ? {
            geometry: coordsOut.map((c) => [c[1], c[0]] as [number, number]), // [lng,lat] -> [lat,lng]
            distance: route!.distance,
            duration: route!.duration,
          }
        : null;
    routeCache.set(key, hit);
    return hit;
  } catch {
    return null; // fail soft — client draws a straight line instead
  }
}

function toPair(s: string | null): [number, number] | null {
  const p = String(s || "").split(",");
  const lat = parseFloat(p[0]);
  const lng = parseFloat(p[1]);
  return isFinite(lat) && isFinite(lng) ? [lng, lat] : null; // OSRM order: [lng,lat]
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sp = new URL(req.url).searchParams;
  let coords: Array<[number, number]> = [];
  const points = sp.get("points");
  if (points) {
    coords = points.split(";").map(toPair).filter((c): c is [number, number] => c !== null);
  } else {
    const f = toPair(sp.get("from"));
    const t = toPair(sp.get("to"));
    if (f) coords.push(f);
    if (t) coords.push(t);
  }
  if (coords.length < 2) {
    return NextResponse.json({ error: "cần điểm đầu và điểm cuối" }, { status: 400 });
  }
  if (coords.length > 8) coords = coords.slice(0, 8); // sanity cap
  const hit = await routeOne(coords);
  if (!hit) return NextResponse.json({ error: "không lấy được tuyến đường" }, { status: 502 });
  return NextResponse.json(hit);
}
