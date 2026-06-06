import { afterEach, describe, expect, test, vi } from "vitest";
import { webRead } from "./read";
import type { ToolContext } from "../../types";

const ctx: ToolContext = { userId: "u1", now: Date.UTC(2026, 5, 6), lang: "vi" };

afterEach(() => vi.restoreAllMocks());

describe("web_read tool", () => {
  test("metadata: read tool named web_read, url required", () => {
    expect(webRead.name).toBe("web_read");
    expect(webRead.kind).toBe("read");
    expect((webRead.parameters as { required?: string[] }).required).toContain("url");
  });

  test("returns cleaned title + text for an html page", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("<html><head><title>Doc</title></head><body><p>Hi &amp; bye</p></body></html>", {
        headers: { "content-type": "text/html" },
      }),
    );
    const out = (await webRead.handler({ url: "https://example.com/x" }, ctx)) as {
      title: string; text: string; url: string;
    };
    expect(out.title).toBe("Doc");
    expect(out.text).toContain("Hi & bye");
    expect(out.url).toBe("https://example.com/x");
  });

  test("blocked internal host → { error } (no page data)", async () => {
    const out = (await webRead.handler({ url: "http://127.0.0.1/secret" }, ctx)) as {
      error?: string; text?: string;
    };
    expect(out.error).toBeTruthy();
    expect(out.text).toBeUndefined();
  });

  test("caps text at 6000 chars so the result fits the guard 8192-byte bound", async () => {
    const long = "<body>" + "a".repeat(9000) + "</body>";
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(long, { headers: { "content-type": "text/html" } }),
    );
    const out = (await webRead.handler({ url: "https://example.com/long" }, ctx)) as {
      text: string; truncated: boolean;
    };
    expect(out.text.length).toBe(6000);
    expect(out.truncated).toBe(true);
  });
});
