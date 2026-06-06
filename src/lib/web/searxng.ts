// SearXNG client — self-hosted, $0 metasearch. The app talks to a local SearXNG
// instance (SEARXNG_URL) and reads its JSON API. Keeps the harness web_search tool
// free of any paid/SaaS search API. `fetchImpl` is injectable for tests.

type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

export type SearchHit = { title: string; url: string; snippet: string };
export type SearchResult =
  | { ok: true; query: string; results: SearchHit[] }
  | { ok: false; error: string };

const DEFAULT_COUNT = 5;
const MAX_COUNT = 10;

// SearXNG result objects: { url, title, content (snippet), engine, ... }. Map to our
// compact hit shape, drop entries without a url, and cap to `count`.
export function mapSearxngResults(json: unknown, count: number): SearchHit[] {
  const raw = (json as { results?: unknown } | null)?.results;
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, count)
    .map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      return { title: String(o.title ?? ""), url: String(o.url ?? ""), snippet: String(o.content ?? "") };
    })
    .filter((h) => h.url);
}

export async function searxngSearch(
  query: string,
  opts: { count?: number; baseUrl?: string; fetchImpl?: FetchImpl } = {},
): Promise<SearchResult> {
  const q = String(query ?? "").trim();
  if (!q) return { ok: false, error: "thiếu truy vấn" };
  const baseUrl = (opts.baseUrl ?? process.env.SEARXNG_URL ?? "").replace(/\/$/, "");
  if (!baseUrl) return { ok: false, error: "SEARXNG_URL chưa cấu hình" };
  const count = Math.min(Math.max(1, Number(opts.count) || DEFAULT_COUNT), MAX_COUNT);
  const doFetch: FetchImpl = opts.fetchImpl ?? fetch;
  const url = `${baseUrl}/search?q=${encodeURIComponent(q)}&format=json`;
  try {
    const r = await doFetch(url, { headers: { accept: "application/json" } });
    if (!r.ok) return { ok: false, error: `SearXNG ${r.status}` };
    const json = await r.json();
    return { ok: true, query: q, results: mapSearxngResults(json, count) };
  } catch (e) {
    return { ok: false, error: "Không gọi được SearXNG: " + (e instanceof Error ? e.message : String(e)) };
  }
}
