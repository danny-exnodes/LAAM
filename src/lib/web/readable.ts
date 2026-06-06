// Shared web-fetch helpers: SSRF guard + html→text + fetch-and-extract that returns
// readable page text. Used by BOTH /api/fetch-url (UI URL paste) and the web_read
// harness tool — ONE source of truth (the route imports these; logic ported from
// the original route: isBlockedHost + htmlToText).

const DEFAULT_TIMEOUT_MS = 12000;

// Block localhost / private / loopback / link-local IPv4 ranges and IPv6.
export function isBlockedHost(host: string): boolean {
  const h = (host || "").toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h === "0.0.0.0") return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (h.includes(":")) return true; // IPv6 / host:port oddities — be conservative
  return false;
}

export function htmlToText(html: string): string {
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

export type Readable = { url: string; title: string; text: string; truncated: boolean };
export type ReadableResult =
  | { ok: true; data: Readable }
  | { ok: false; status: number; error: string };

type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

// Fetch a public http(s) URL and return its readable text. SSRF-guarded (no internal
// hosts). `fetchImpl` is injectable for tests; defaults to global fetch so the route's
// existing `vi.spyOn(global,"fetch")` test still intercepts it. `maxText` caps the
// returned text (route/UI = 12000; the web_read tool passes a smaller cap to fit the
// guard's 8192-byte output bound).
export async function fetchReadable(
  rawUrl: string,
  opts: { maxText?: number; timeoutMs?: number; fetchImpl?: FetchImpl } = {},
): Promise<ReadableResult> {
  const maxText = opts.maxText ?? 12000;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const doFetch: FetchImpl = opts.fetchImpl ?? fetch;

  const raw = String(rawUrl ?? "").trim();
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, status: 400, error: "URL không hợp lệ" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, status: 400, error: "Chỉ hỗ trợ http/https" };
  }
  if (isBlockedHost(u.hostname)) {
    return { ok: false, status: 403, error: "Chặn địa chỉ nội bộ/loopback" };
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let r: Response;
    try {
      r = await doFetch(u.href, {
        signal: ctrl.signal,
        redirect: "follow",
        headers: { "user-agent": "LAAM-chat/0.1" },
      });
    } finally {
      clearTimeout(timer);
    }
    const ctype = r.headers.get("content-type") || "";
    const text0 = await r.text();
    const text = /html/i.test(ctype) ? htmlToText(text0) : text0;
    const titleMatch = text0.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return {
      ok: true,
      data: {
        url: u.href,
        title: titleMatch ? titleMatch[1].trim().slice(0, 200) : u.hostname,
        text: text.slice(0, maxText),
        truncated: text.length > maxText,
      },
    };
  } catch (e) {
    return { ok: false, status: 502, error: "Không tải được URL: " + (e instanceof Error ? e.message : String(e)) };
  }
}
