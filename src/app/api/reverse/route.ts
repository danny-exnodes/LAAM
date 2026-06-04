import { NextResponse } from "next/server";
import { auth } from "@/auth";

// Reverse geocode (coords -> address) via Nominatim, for location awareness.
// Cached + throttled (identifying User-Agent). Ported from v1 (bin/laam.js).

const UA = "LAAM-chat/0.1 (local AI agent monitoring; self-host)";

type Rev = { address: string; lat: number; lng: number };

const revCache = new Map<string, Rev | null>();
let lastRevCall = 0;

async function reverseOne(lat: number, lng: number): Promise<Rev | null> {
  const key = lat.toFixed(4) + "," + lng.toFixed(4);
  if (revCache.has(key)) return revCache.get(key) ?? null;
  const wait = Math.max(0, 1100 - (Date.now() - lastRevCall));
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastRevCall = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const url =
      "https://nominatim.openstreetmap.org/reverse?format=json&zoom=16&addressdetails=1&lat=" +
      encodeURIComponent(String(lat)) +
      "&lon=" +
      encodeURIComponent(String(lng));
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, "Accept-Language": "vi,en" },
    });
    clearTimeout(timer);
    const j = (await r.json()) as { display_name?: string };
    const hit: Rev | null = j && j.display_name ? { address: j.display_name, lat, lng } : null;
    revCache.set(key, hit);
    return hit;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sp = new URL(req.url).searchParams;
  const lat = parseFloat(sp.get("lat") ?? "");
  const lng = parseFloat(sp.get("lng") ?? "");
  if (!isFinite(lat) || !isFinite(lng)) {
    return NextResponse.json({ error: "cần lat & lng" }, { status: 400 });
  }
  const hit = await reverseOne(lat, lng);
  if (!hit) return NextResponse.json({ error: "không tra được địa chỉ" }, { status: 404 });
  return NextResponse.json(hit);
}
