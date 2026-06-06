import { describe, expect, test } from "vitest";
import { isBlockedHost, htmlToText, fetchReadable } from "./readable";

// Một fetch giả: trả Response từ (body, content-type) đã định sẵn, hoặc throw.
function fakeFetch(body: string, contentType = "text/html") {
  return async () => new Response(body, { headers: { "content-type": contentType } });
}

describe("isBlockedHost (SSRF guard)", () => {
  test("blocks loopback / private / link-local / IPv6", () => {
    for (const host of [
      "localhost", "foo.local", "0.0.0.0", "127.0.0.1", "127.5.5.5",
      "10.0.0.1", "192.168.1.1", "169.254.1.1", "172.16.0.1", "172.31.255.255", "::1",
    ]) {
      expect(isBlockedHost(host), `${host} blocked`).toBe(true);
    }
  });
  test("allows public hosts (incl. 172.15/172.32 just outside the private range)", () => {
    for (const host of ["example.com", "8.8.8.8", "1.1.1.1", "172.15.0.1", "172.32.0.1"]) {
      expect(isBlockedHost(host), `${host} allowed`).toBe(false);
    }
  });
});

describe("htmlToText", () => {
  test("strips script/style/tags and decodes entities", () => {
    const html = "<html><head><title>T</title><style>.a{}</style></head>" +
      "<body><p>World &amp; peace</p><script>evil()</script></body></html>";
    const out = htmlToText(html);
    expect(out).toContain("World & peace");
    expect(out).not.toContain("evil()");
    expect(out).not.toContain(".a{}");
    expect(out).not.toContain("<p>");
  });
});

describe("fetchReadable", () => {
  test("invalid URL → 400", async () => {
    const r = await fetchReadable("not a url", { fetchImpl: fakeFetch("x") });
    expect(r).toEqual({ ok: false, status: 400, error: expect.any(String) });
  });

  test("non-http(s) protocol → 400", async () => {
    const r = await fetchReadable("ftp://example.com/x", { fetchImpl: fakeFetch("x") });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  test("blocked internal host → 403 (does not fetch)", async () => {
    let called = false;
    const r = await fetchReadable("http://127.0.0.1:8080/admin", {
      fetchImpl: async () => { called = true; return new Response("x"); },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
    expect(called, "must not fetch a blocked host").toBe(false);
  });

  test("public html → ok with title + cleaned text", async () => {
    const html = "<html><head><title> Hello </title></head><body><p>World &amp; peace</p><script>x()</script></body></html>";
    const r = await fetchReadable("https://example.com/page", { fetchImpl: fakeFetch(html) });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.title).toBe("Hello");
      expect(r.data.text).toContain("World & peace");
      expect(r.data.text).not.toContain("x()");
      expect(r.data.url).toBe("https://example.com/page");
      expect(r.data.truncated).toBe(false);
    }
  });

  test("non-html content-type → returned verbatim (not tag-stripped)", async () => {
    const r = await fetchReadable("https://example.com/data.json", {
      fetchImpl: fakeFetch('{"a":1}', "application/json"),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.text).toBe('{"a":1}');
  });

  test("maxText caps the text and sets truncated", async () => {
    const long = "<body>" + "a".repeat(5000) + "</body>";
    const r = await fetchReadable("https://example.com/long", { maxText: 100, fetchImpl: fakeFetch(long) });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.text.length).toBe(100);
      expect(r.data.truncated).toBe(true);
    }
  });

  test("upstream fetch throws → 502", async () => {
    const r = await fetchReadable("https://example.com", {
      fetchImpl: async () => { throw new Error("network down"); },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(502);
  });
});
