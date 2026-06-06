import { describe, expect, test } from "vitest";
import { mapSearxngResults, searxngSearch } from "./searxng";

const BASE = "http://searxng.test:8080";

// SearXNG /search?format=json returns { results: [{ url, title, content, ... }] }.
function jsonFetch(payload: unknown, capture?: (url: string) => void) {
  return async (url: string) => {
    capture?.(url);
    return new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } });
  };
}

describe("mapSearxngResults", () => {
  test("maps title/url/content→snippet and caps to count", () => {
    const json = {
      results: [
        { title: "A", url: "https://a.com", content: "alpha" },
        { title: "B", url: "https://b.com", content: "beta" },
        { title: "C", url: "https://c.com", content: "gamma" },
      ],
    };
    const hits = mapSearxngResults(json, 2);
    expect(hits).toEqual([
      { title: "A", url: "https://a.com", snippet: "alpha" },
      { title: "B", url: "https://b.com", snippet: "beta" },
    ]);
  });

  test("drops results without a url; tolerates missing fields", () => {
    const json = { results: [{ title: "no-url", content: "x" }, { url: "https://ok.com" }] };
    const hits = mapSearxngResults(json, 5);
    expect(hits).toEqual([{ title: "", url: "https://ok.com", snippet: "" }]);
  });

  test("non-array results → []", () => {
    expect(mapSearxngResults({}, 5)).toEqual([]);
    expect(mapSearxngResults({ results: "nope" }, 5)).toEqual([]);
  });
});

describe("searxngSearch", () => {
  test("empty query → error (no fetch)", async () => {
    const r = await searxngSearch("  ", { baseUrl: BASE, fetchImpl: async () => new Response("x") });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/truy vấn/);
  });

  test("missing SEARXNG_URL → error", async () => {
    const r = await searxngSearch("cats", { baseUrl: "", fetchImpl: async () => new Response("x") });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/SEARXNG_URL/);
  });

  test("success → ok with mapped + count-capped results", async () => {
    const payload = { results: Array.from({ length: 20 }, (_, i) => ({ title: `T${i}`, url: `https://x/${i}`, content: `c${i}` })) };
    const r = await searxngSearch("dogs", { baseUrl: BASE, count: 3, fetchImpl: jsonFetch(payload) });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.results).toHaveLength(3);
      expect(r.results[0]).toEqual({ title: "T0", url: "https://x/0", snippet: "c0" });
      expect(r.query).toBe("dogs");
    }
  });

  test("count is clamped to 10 max", async () => {
    const payload = { results: Array.from({ length: 20 }, (_, i) => ({ title: `T${i}`, url: `https://x/${i}`, content: "" })) };
    const r = await searxngSearch("q", { baseUrl: BASE, count: 50, fetchImpl: jsonFetch(payload) });
    if (r.ok) expect(r.results.length).toBe(10);
  });

  test("calls /search with format=json and an url-encoded query", async () => {
    let calledUrl = "";
    await searxngSearch("hello world", { baseUrl: BASE, fetchImpl: jsonFetch({ results: [] }, (u) => (calledUrl = u)) });
    expect(calledUrl).toContain("/search?");
    expect(calledUrl).toContain("format=json");
    expect(calledUrl).toContain("hello%20world");
  });

  test("non-ok upstream → error with status", async () => {
    const r = await searxngSearch("q", { baseUrl: BASE, fetchImpl: async () => new Response("nope", { status: 502 }) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/502/);
  });

  test("fetch throws → fail-soft error", async () => {
    const r = await searxngSearch("q", { baseUrl: BASE, fetchImpl: async () => { throw new Error("down"); } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/down/);
  });
});
