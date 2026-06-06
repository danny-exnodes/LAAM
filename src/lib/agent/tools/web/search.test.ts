import { afterEach, describe, expect, test, vi } from "vitest";
import { webSearch } from "./search";
import type { ToolContext } from "../../types";

const ctx: ToolContext = { userId: "u1", now: 0, lang: "vi" };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("web_search tool", () => {
  test("metadata: read tool named web_search, query required", () => {
    expect(webSearch.name).toBe("web_search");
    expect(webSearch.kind).toBe("read");
    expect((webSearch.parameters as { required?: string[] }).required).toContain("query");
  });

  test("returns mapped results when SearXNG responds", async () => {
    vi.stubEnv("SEARXNG_URL", "http://searxng.test:8080");
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: [{ title: "R", url: "https://r.com", content: "snip" }] }), {
        headers: { "content-type": "application/json" },
      }),
    );
    const out = (await webSearch.handler({ query: "next.js 16" }, ctx)) as { results: { url: string }[] };
    expect(out.results).toHaveLength(1);
    expect(out.results[0].url).toBe("https://r.com");
  });

  test("no SEARXNG_URL configured → { error } (fail-soft, no results key)", async () => {
    vi.stubEnv("SEARXNG_URL", "");
    const out = (await webSearch.handler({ query: "x" }, ctx)) as { error?: string; results?: unknown };
    expect(out.error).toBeTruthy();
    expect(out.results).toBeUndefined();
  });
});
