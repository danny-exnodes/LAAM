import { NextResponse } from "next/server";
import { auth } from "@/auth";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !url.searchParams.get("lat") || !url.searchParams.get("lng")) {
    return NextResponse.json({ error: "bad coords" }, { status: 400 });
  }
  try {
    const r = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code`,
      { signal: AbortSignal.timeout(4000) },
    );
    if (!r.ok) throw new Error("upstream");
    const j = await r.json() as { current: { temperature_2m: number; weather_code: number } };
    return NextResponse.json({ tempC: Math.round(j.current.temperature_2m), code: j.current.weather_code });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
