import { NextResponse } from "next/server";
import { auth } from "@/auth";

// Nearby POI search (real places around the user) via Overpass. Maps a
// free-text category to OSM tag filters; unknown queries fall back to a
// viewbox-bounded Nominatim search. Keyless, cached, timed-out, fail-soft.
// Ported from v1 (bin/laam.js).

const UA = "LAAM-chat/0.1 (self-host)";

type Poi = { name: string; lat: number; lng: number; dist: number; kind: string | null };

const POI_TAGS: Record<string, string[]> = {
  cafe: ["amenity=cafe"], coffee: ["amenity=cafe"], "quán cafe": ["amenity=cafe"], "cà phê": ["amenity=cafe"], "càphê": ["amenity=cafe"], "咖啡": ["amenity=cafe"], "咖啡店": ["amenity=cafe"],
  restaurant: ["amenity=restaurant"], "nhà hàng": ["amenity=restaurant"], "quán ăn": ["amenity=restaurant", "amenity=fast_food"], "餐厅": ["amenity=restaurant"], "饭店": ["amenity=restaurant"],
  bar: ["amenity=bar", "amenity=pub"], "quán bar": ["amenity=bar", "amenity=pub"], "酒吧": ["amenity=bar", "amenity=pub"],
  atm: ["amenity=atm"], "cây atm": ["amenity=atm"], "máy atm": ["amenity=atm"], "取款机": ["amenity=atm"],
  bank: ["amenity=bank"], "ngân hàng": ["amenity=bank"], "银行": ["amenity=bank"],
  pharmacy: ["amenity=pharmacy"], "nhà thuốc": ["amenity=pharmacy"], "hiệu thuốc": ["amenity=pharmacy"], "药店": ["amenity=pharmacy"], "药房": ["amenity=pharmacy"],
  hospital: ["amenity=hospital"], "bệnh viện": ["amenity=hospital"], "医院": ["amenity=hospital"],
  hotel: ["tourism=hotel", "tourism=guest_house"], "khách sạn": ["tourism=hotel", "tourism=guest_house"], "nhà nghỉ": ["tourism=guest_house", "tourism=hotel"], "酒店": ["tourism=hotel"], "宾馆": ["tourism=hotel"],
  fuel: ["amenity=fuel"], "cây xăng": ["amenity=fuel"], "trạm xăng": ["amenity=fuel"], "xăng": ["amenity=fuel"], "加油站": ["amenity=fuel"],
  supermarket: ["shop=supermarket", "shop=convenience"], "siêu thị": ["shop=supermarket"], "tạp hoá": ["shop=convenience"], "超市": ["shop=supermarket"],
  parking: ["amenity=parking"], "bãi đỗ xe": ["amenity=parking"], "bãi đỗ": ["amenity=parking"], "停车场": ["amenity=parking"],
  hospital_clinic: ["amenity=clinic"],
  school: ["amenity=school"], "trường học": ["amenity=school"], "学校": ["amenity=school"],
  park: ["leisure=park"], "công viên": ["leisure=park"], "公园": ["leisure=park"],
  toilet: ["amenity=toilets"], "nhà vệ sinh": ["amenity=toilets"], "厕所": ["amenity=toilets"], "洗手间": ["amenity=toilets"],
  bus: ["highway=bus_stop", "amenity=bus_station"], "bến xe buýt": ["amenity=bus_station", "highway=bus_stop"], "trạm xe buýt": ["highway=bus_stop"], "公交站": ["highway=bus_stop"],
};

function poiTagsFor(q: string): string[] | null {
  const key = String(q || "").trim().toLowerCase();
  if (POI_TAGS[key]) return POI_TAGS[key];
  for (const k in POI_TAGS) {
    if (k.length > 2 && key.indexOf(k) >= 0) return POI_TAGS[k];
  }
  return null;
}

function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}

let lastOverpass = 0;

async function nearbyOverpass(lat: number, lng: number, tags: string[], radius: number): Promise<Poi[]> {
  const filters = tags
    .map((t) => {
      const i = t.indexOf("=");
      const k = t.slice(0, i);
      const v = t.slice(i + 1);
      return `node["${k}"="${v}"](around:${radius},${lat},${lng});way["${k}"="${v}"](around:${radius},${lat},${lng});`;
    })
    .join("");
  const ql = `[out:json][timeout:18];(${filters});out center 60;`;
  const wait = Math.max(0, 1000 - (Date.now() - lastOverpass));
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastOverpass = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  const r = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    signal: ctrl.signal,
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
    body: "data=" + encodeURIComponent(ql),
  });
  clearTimeout(timer);
  const j = (await r.json()) as {
    elements?: Array<{
      type: string;
      lat?: number;
      lon?: number;
      center?: { lat: number; lon: number };
      tags?: Record<string, string>;
    }>;
  };
  const els = Array.isArray(j.elements) ? j.elements : [];
  const out: Poi[] = [];
  for (const e of els) {
    const p =
      e.type === "node" && e.lat != null && e.lon != null
        ? { lat: e.lat, lng: e.lon }
        : e.center
          ? { lat: e.center.lat, lng: e.center.lon }
          : null;
    if (!p) continue;
    const name = (e.tags && (e.tags.name || e.tags["name:en"] || e.tags["name:vi"])) || null;
    if (!name) continue; // skip unnamed POIs — not useful to list
    out.push({
      name,
      lat: p.lat,
      lng: p.lng,
      dist: haversine(lat, lng, p.lat, p.lng),
      kind: (e.tags && (e.tags.amenity || e.tags.shop || e.tags.tourism || e.tags.leisure)) || null,
    });
  }
  // de-dup by name+rounded coords, sort by distance
  const seen = new Set<string>();
  const dedup: Poi[] = [];
  out.sort((a, b) => a.dist - b.dist);
  for (const o of out) {
    const k = o.name + "@" + o.lat.toFixed(4) + "," + o.lng.toFixed(4);
    if (!seen.has(k)) {
      seen.add(k);
      dedup.push(o);
    }
  }
  return dedup;
}

let lastNominatim = 0;
const nearbyCache = new Map<string, Poi[]>();

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
  const q = String(sp.get("q") ?? "").slice(0, 60);
  let limit = parseInt(sp.get("limit") ?? "", 10);
  if (!isFinite(limit) || limit < 1) limit = 10;
  limit = Math.min(limit, 30);
  let radius = parseInt(sp.get("radius") ?? "", 10);
  if (!isFinite(radius) || radius < 100) radius = 1500;
  radius = Math.min(radius, 5000);

  const cacheKey = lat.toFixed(3) + "," + lng.toFixed(3) + "|" + q.toLowerCase() + "|" + radius;
  try {
    let list = nearbyCache.get(cacheKey);
    if (!list) {
      const tags = poiTagsFor(q);
      if (tags) {
        list = await nearbyOverpass(lat, lng, tags, radius);
      } else {
        // Unknown category → Nominatim search bounded to a viewbox around the user.
        const d = radius / 111000; // ~deg
        const vb = [lng - d, lat + d, lng + d, lat - d].join(",");
        const wait = Math.max(0, 1100 - (Date.now() - lastNominatim));
        if (wait) await new Promise((r) => setTimeout(r, wait));
        lastNominatim = Date.now();
        const url =
          "https://nominatim.openstreetmap.org/search?format=json&limit=" +
          limit +
          "&bounded=1&viewbox=" +
          vb +
          "&q=" +
          encodeURIComponent(q);
        const r2 = await fetch(url, {
          headers: { "User-Agent": UA, "Accept-Language": "vi,en" },
        });
        const arr = (await r2.json()) as Array<{ display_name?: string; lat: string; lon: string; type?: string }>;
        list = (Array.isArray(arr) ? arr : [])
          .map((a) => ({
            name: (a.display_name || "").split(",")[0],
            lat: parseFloat(a.lat),
            lng: parseFloat(a.lon),
            dist: haversine(lat, lng, parseFloat(a.lat), parseFloat(a.lon)),
            kind: a.type || null,
          }))
          .sort((x, y) => x.dist - y.dist);
      }
      nearbyCache.set(cacheKey, list);
    }
    return NextResponse.json({ query: q, center: { lat, lng }, radius, results: list.slice(0, limit) });
  } catch {
    return NextResponse.json({ error: "không tìm được địa điểm quanh đây" }, { status: 502 });
  }
}
