import { NextResponse } from "next/server";
import { auth } from "@/auth";

// Fetch a USER-SUPPLIED URL server-side and return its text, so the chat can
// read web pages. SSRF-guarded: only public http(s) hosts. Ported from v1
// (bin/laam.js): isBlockedHost + htmlToText.

const MAX_TEXT = 12000;
const FETCH_TIMEOUT_MS = 12000;

// Block localhost / private / loopback / link-local IPv4 ranges and IPv6.
// Exported so the SSRF guard can be unit-tested as a pure function.
export function isBlockedHost(host: string): boolean {
  const h = (host || "").toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h === "0.0.0.0") return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (h.includes(":")) return true; // IPv6 / host:port oddities — be conservative
  return false;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { url?: string } | null;
  const raw = String(body?.url ?? "").trim();
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return NextResponse.json({ error: "URL không hợp lệ" }, { status: 400 });
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return NextResponse.json({ error: "Chỉ hỗ trợ http/https" }, { status: 400 });
  }
  if (isBlockedHost(u.hostname)) {
    return NextResponse.json({ error: "Chặn địa chỉ nội bộ/loopback" }, { status: 403 });
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const r = await fetch(u.href, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": "LAAM-chat/0.1" },
    });
    clearTimeout(timer);
    const ctype = r.headers.get("content-type") || "";
    const text0 = await r.text();
    const text = /html/i.test(ctype) ? htmlToText(text0) : text0;
    const titleMatch = text0.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return NextResponse.json({
      url: u.href,
      title: titleMatch ? titleMatch[1].trim().slice(0, 200) : u.hostname,
      text: text.slice(0, MAX_TEXT),
      truncated: text.length > MAX_TEXT,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Không tải được URL: " + (e instanceof Error ? e.message : String(e)) },
      { status: 502 },
    );
  }
}
