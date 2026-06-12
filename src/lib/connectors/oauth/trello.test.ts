import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import {
  trelloAuthorizeConfigured,
  trelloAuthorizeUrl,
  trelloVerifyToken,
  TRELLO_CALLBACK_PATH,
} from "./trello";

function fakeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  process.env.TRELLO_API_KEY = "trello-key-32hex";
  process.env.OAUTH_PUBLIC_BASE_URL = "https://laam.example.ts.net";
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.TRELLO_API_KEY;
  delete process.env.OAUTH_PUBLIC_BASE_URL;
});

describe("trelloAuthorizeConfigured", () => {
  test("đòi CẢ TRELLO_API_KEY và OAUTH_PUBLIC_BASE_URL (không bao giờ fallback request-origin)", () => {
    expect(trelloAuthorizeConfigured()).toBe(true);
    delete process.env.OAUTH_PUBLIC_BASE_URL;
    expect(trelloAuthorizeConfigured()).toBe(false);
    expect(trelloAuthorizeUrl()).toBeNull();
  });
});

describe("trelloAuthorizeUrl", () => {
  test("đúng params: fragment callback, scope read,write, return_url = PAGE path trên base env", () => {
    const u = new URL(trelloAuthorizeUrl()!);
    expect(u.origin + u.pathname).toBe("https://trello.com/1/authorize");
    expect(u.searchParams.get("response_type")).toBe("token");
    expect(u.searchParams.get("callback_method")).toBe("fragment");
    expect(u.searchParams.get("scope")).toBe("read,write");
    expect(u.searchParams.get("expiration")).toBe("never");
    expect(u.searchParams.get("key")).toBe("trello-key-32hex");
    expect(u.searchParams.get("return_url")).toBe(
      "https://laam.example.ts.net" + TRELLO_CALLBACK_PATH,
    );
  });
});

describe("trelloVerifyToken (verify-before-persist)", () => {
  test("token hợp lệ → ok + username; key+token đi qua HEADER Authorization, không nằm trong URL", async () => {
    const fetchMock = vi.fn(async () => fakeResponse(200, { username: "danny" }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await trelloVerifyToken("user-token-abc");
    expect(r).toEqual({ ok: true, username: "danny" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).not.toContain("user-token-abc");
    const authHeader = (init.headers as Record<string, string>).Authorization;
    expect(authHeader).toContain('oauth_consumer_key="trello-key-32hex"');
    expect(authHeader).toContain('oauth_token="user-token-abc"');
  });
  test("401 → ok:false (token bịa/đã thu hồi không bao giờ được persist)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(401, null)));
    const r = await trelloVerifyToken("forged");
    expect(r.ok).toBe(false);
  });
});
