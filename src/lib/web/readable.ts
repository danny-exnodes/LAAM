// Shared web-fetch helpers: SSRF guard + html→text + fetch-and-extract that returns
// readable page text. Used by BOTH /api/fetch-url (UI URL paste) and the web_read
// harness tool — ONE source of truth (the route imports these; logic ported from
// the original route: isBlockedHost + htmlToText).

const DEFAULT_TIMEOUT_MS = 12000;
const MAX_REDIRECTS = 5;

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

  // Validate a URL: must be public http(s). Applied to the initial URL AND every
  // redirect hop, so a public page cannot bounce us onto an internal host (SSRF).
  const check = (x: URL): { ok: false; status: number; error: string } | null => {
    if (x.protocol !== "http:" && x.protocol !== "https:")
      return { ok: false, status: 400, error: "Chỉ hỗ trợ http/https" };
    if (isBlockedHost(x.hostname))
      return { ok: false, status: 403, error: "Chặn địa chỉ nội bộ/loopback" };
    return null;
  };

  let current: URL;
  try {
    current = new URL(String(rawUrl ?? "").trim());
  } catch {
    return { ok: false, status: 400, error: "URL không hợp lệ" };
  }
  const bad = check(current);
  if (bad) return bad;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // Follow redirects MANUALLY so each Location is re-validated. redirect:"follow"
    // would let the runtime chase a 3xx onto a blocked host with no guard.
    let r: Response;
    for (let hop = 0; ; hop++) {
      r = await doFetch(current.href, {
        signal: ctrl.signal,
        redirect: "manual",
        headers: { "user-agent": "LAAM-chat/0.1" },
      });
      const loc = r.status >= 300 && r.status < 400 ? r.headers.get("location") : null;
      if (!loc) break;
      if (hop >= MAX_REDIRECTS) return { ok: false, status: 502, error: "Quá nhiều chuyển hướng" };
      let next: URL;
      try {
        next = new URL(loc, current.href); // resolve relative redirects against the current URL
      } catch {
        return { ok: false, status: 502, error: "Chuyển hướng không hợp lệ" };
      }
      const badHop = check(next);
      if (badHop) return { ...badHop, error: "Chặn chuyển hướng: " + badHop.error };
      current = next;
    }

    const ctype = r.headers.get("content-type") || "";
    const text0 = await r.text();
    const text = /html/i.test(ctype) ? htmlToText(text0) : text0;
    const titleMatch = text0.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return {
      ok: true,
      data: {
        url: current.href,
        title: titleMatch ? htmlToText(titleMatch[1]).slice(0, 200) : current.hostname,
        text: text.slice(0, maxText),
        truncated: text.length > maxText,
      },
    };
  } catch (e) {
    return { ok: false, status: 502, error: "Không tải được URL: " + (e instanceof Error ? e.message : String(e)) };
  } finally {
    clearTimeout(timer);
  }
}
