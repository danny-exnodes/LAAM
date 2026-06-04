import { afterEach, describe, expect, test, vi } from "vitest";

const h = vi.hoisted(() => ({
  authResult: null as { user?: { id: string } } | null,
}));

vi.mock("@/auth", () => ({ auth: vi.fn(async () => h.authResult) }));

import { POST, isBlockedHost } from "./route";

function postReq(body: unknown) {
  return new Request("http://test/api/fetch-url", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  h.authResult = null;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("isBlockedHost (SSRF guard)", () => {
  test("blocks loopback / private / link-local / special hosts", () => {
    for (const host of [
      "localhost",
      "foo.local",
      "0.0.0.0",
      "127.0.0.1",
      "127.5.5.5",
      "10.0.0.1",
      "192.168.1.1",
      "169.254.1.1",
      "172.16.0.1",
      "172.31.255.255",
      "::1", // IPv6 — contains ':'
    ]) {
      expect(isBlockedHost(host), `${host} should be blocked`).toBe(true);
    }
  });

  test("allows public hosts", () => {
    for (const host of ["example.com", "8.8.8.8", "1.1.1.1", "172.15.0.1", "172.32.0.1"]) {
      expect(isBlockedHost(host), `${host} should be allowed`).toBe(false);
    }
  });
});

describe("POST /api/fetch-url", () => {
  test("401 when unauthenticated", async () => {
    h.authResult = null;
    const res = await POST(postReq({ url: "https://example.com" }));
    expect(res.status).toBe(401);
  });

  test("400 on invalid URL", async () => {
    h.authResult = { user: { id: "u1" } };
    const res = await POST(postReq({ url: "not a url" }));
    expect(res.status).toBe(400);
  });

  test("400 on non-http(s) protocol", async () => {
    h.authResult = { user: { id: "u1" } };
    const res = await POST(postReq({ url: "ftp://example.com/x" }));
    expect(res.status).toBe(400);
  });

  test("403 on blocked/internal host", async () => {
    h.authResult = { user: { id: "u1" } };
    const res = await POST(postReq({ url: "http://127.0.0.1:8080/admin" }));
    expect(res.status).toBe(403);
  });

  test("200 returns extracted text + title for a public html page", async () => {
    h.authResult = { user: { id: "u1" } };
    const html = "<html><head><title> Hello </title></head><body><p>World &amp; peace</p><script>x()</script></body></html>";
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(html, { headers: { "content-type": "text/html" } }),
    );
    const res = await POST(postReq({ url: "https://example.com/page" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Hello");
    expect(body.text).toContain("World & peace");
    expect(body.text).not.toContain("x()");
    expect(body.url).toBe("https://example.com/page");
  });

  test("502 when the upstream fetch throws", async () => {
    h.authResult = { user: { id: "u1" } };
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("network down"));
    const res = await POST(postReq({ url: "https://example.com" }));
    expect(res.status).toBe(502);
  });
});
