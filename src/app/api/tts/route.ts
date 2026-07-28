import { auth } from "@/auth";

// The self-hosted TTS voice (VieNeu-TTS) synthesizes on CPU, so a single
// sentence-sized chunk can take up to ~7s — and digit-dense text (a UUID read
// out digit-by-digit) is the worst case. The original 8s left no headroom under
// CPU load: dense chunks tipped over it, the request 502'd, and the page fell
// back to the robotic browser voice mid-reply. 20s covers the worst measured
// chunk with margin while still failing over to the browser voice if the
// upstream is actually down.
const TTS_UPSTREAM_TIMEOUT_MS = 20000;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("unauthorized", { status: 401 });
  const endpoint = process.env.CONSTELLATION_TTS_URL;
  if (!endpoint) return new Response("tts not configured", { status: 501 });
  const { text, lang } = await req.json() as { text?: string; lang?: string };
  if (!text) return new Response("no text", { status: 400 });
  try {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, lang: lang ?? "vi" }),
      signal: AbortSignal.timeout(TTS_UPSTREAM_TIMEOUT_MS),
    });
    if (!r.ok) return new Response("tts upstream error", { status: 502 });
    return new Response(await r.arrayBuffer(), {
      headers: { "content-type": r.headers.get("content-type") ?? "audio/wav" },
    });
  } catch {
    return new Response("tts unavailable", { status: 502 });
  }
}
