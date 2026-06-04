import { auth } from "@/auth";
import type { HostMetrics } from "@/lib/host-metrics.types";

// Proxy to the host-native metrics sampler (host-agent/laam-host-metrics.mjs).
// Auth-gated; fail-soft 503 when the sampler is unreachable (same spirit as
// /api/ocr). Prod (container) reaches it via host.docker.internal; dev via
// localhost — configured by HOST_METRICS_URL.

const SAMPLER_URL = process.env.HOST_METRICS_URL || "http://host.docker.internal:47600";
const TOKEN = process.env.HOST_METRICS_TOKEN || "";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const r = await fetch(`${SAMPLER_URL}/metrics`, {
      signal: ctrl.signal,
      headers: TOKEN ? { authorization: `Bearer ${TOKEN}` } : {},
      cache: "no-store",
    });
    if (!r.ok) {
      return Response.json({ error: "host metrics unavailable" }, { status: 503 });
    }
    const data = (await r.json()) as HostMetrics;
    return Response.json(data);
  } catch {
    return Response.json(
      { error: "host metrics sampler unreachable" },
      { status: 503 },
    );
  } finally {
    clearTimeout(timer);
  }
}
