import { NextResponse } from "next/server";
import { auth } from "@/auth";

// Geocoding via Nominatim (OpenStreetMap) — resolve a place NAME to lat/lng so
// the chat map uses real coordinates. Cached + throttled to respect
// Nominatim's usage policy (≤1 req/s, identifying User-Agent). Ported from v1.

const UA = "LAAM-chat/0.1 (local AI agent monitoring; self-host)";

type Geo = { lat: number; lng: number; display: string };

const geoCache = new Map<string, Geo | null>();
let lastGeoCall = 0;

async function geocodeOne(q: string): Promise<Geo | null> {
  const query = String(q || "").trim();
  if (!query) return null;
  const key = query.toLowerCase();
  if (geoCache.has(key)) return geoCache.get(key) ?? null;
  const wait = Math.max(0, 1100 - (Date.now() - lastGeoCall));
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastGeoCall = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const url =
      "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(query);
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, "Accept-Language": "vi,en" },
    });
    clearTimeout(timer);
    const arr = (await r.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    const hit: Geo | null =
      Array.isArray(arr) && arr[0]
        ? { lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon), display: arr[0].display_name }
        : null;
    geoCache.set(key, hit);
    return hit;
  } catch {
    return null; // fail soft — never break the chat flow
  }
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (!q.trim()) {
    return NextResponse.json({ error: "cần tham số q" }, { status: 400 });
  }
  const hit = await geocodeOne(q);
  if (!hit) return NextResponse.json({ error: "không tìm thấy địa điểm" }, { status: 404 });
  return NextResponse.json(hit);
}
