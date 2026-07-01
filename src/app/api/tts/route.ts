import { auth } from "@/auth";

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
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return new Response("tts upstream error", { status: 502 });
    return new Response(await r.arrayBuffer(), {
      headers: { "content-type": r.headers.get("content-type") ?? "audio/wav" },
    });
  } catch {
    return new Response("tts unavailable", { status: 502 });
  }
}
