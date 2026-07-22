import { auth } from "@/auth";

// Streaming counterpart to /api/tts: pipes the VieNeu /tts/stream PCM byte stream
// (Int16LE, 48kHz mono) straight through to the /constellation client, UNBUFFERED,
// so audio starts ~0.2s in. CONSTELLATION_TTS_URL points at the WAV endpoint
// (…/tts); the streaming endpoint is that URL + "/stream".
//
// force-dynamic + nodejs runtime: never statically optimize/cache this, and use the
// Node runtime so the fetch ReadableStream body passes through incrementally rather
// than being buffered. (Next 16 differs from older versions — see the streaming note
// in Step 0 below.)
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Generous timeout: it bounds the WHOLE stream, and a long reply can take ~15-20s
// to fully generate (still streaming the entire time). 60s is comfortably above any
// realistic single reply while still failing over if the upstream is truly hung.
// (Edge: a reply whose AUDIO exceeds 60s would be truncated — implausible here.)
const TTS_STREAM_TIMEOUT_MS = 60000;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("unauthorized", { status: 401 });
  const base = process.env.CONSTELLATION_TTS_URL;
  if (!base) return new Response("tts not configured", { status: 501 });
  const { text, lang } = (await req.json()) as { text?: string; lang?: string };
  if (!text) return new Response("no text", { status: 400 });
  try {
    const upstream = await fetch(`${base}/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, lang: lang ?? "vi" }),
      signal: AbortSignal.timeout(TTS_STREAM_TIMEOUT_MS),
    });
    if (!upstream.ok || !upstream.body) return new Response("tts upstream error", { status: 502 });
    return new Response(upstream.body, {
      headers: { "content-type": "application/octet-stream", "cache-control": "no-store" },
    });
  } catch {
    return new Response("tts unavailable", { status: 502 });
  }
}
