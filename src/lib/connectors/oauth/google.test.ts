// Ported from google-oauth.test.ts — same behaviors behind the OAuthProvider
// contract (authUrl/exchange/refresh now take redirectUri explicitly).
import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "crypto";
import { googleProvider, parseIdTokenEmail } from "./google";
import { pkcePair, randomState, redirectUri, OAuthError } from "./types";

function fakeResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

const CB = "https://laam.example.ts.net/api/connectors/google/callback";

beforeEach(() => {
  process.env.GOOGLE_OAUTH_CLIENT_ID = "cid.apps.googleusercontent.com";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "secret";
  process.env.OAUTH_PUBLIC_BASE_URL = "https://laam.example.ts.net/"; // trailing slash on purpose
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.GOOGLE_OAUTH_CLIENT_ID;
  delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  delete process.env.OAUTH_PUBLIC_BASE_URL;
});

describe("configured + redirectUri", () => {
  test("false khi thiếu env", () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    expect(googleProvider.configured()).toBe(false);
  });
  test("redirectUri compose từ base + trim trailing slash", () => {
    expect(redirectUri("google")).toBe(CB);
    expect(googleProvider.configured()).toBe(true);
  });
  test("redirectUri null khi thiếu base", () => {
    delete process.env.OAUTH_PUBLIC_BASE_URL;
    expect(redirectUri("google")).toBeNull();
  });
});

describe("pkcePair", () => {
  test("challenge = base64url(sha256(verifier))", () => {
    const { verifier, challenge } = pkcePair();
    expect(verifier.length).toBeGreaterThan(20);
    const expected = createHash("sha256").update(verifier).digest().toString("base64url");
    expect(challenge).toBe(expected);
    expect(challenge).not.toMatch(/[+/=]/); // base64url, not base64
  });
  test("randomState khác nhau mỗi lần", () => {
    expect(randomState()).not.toBe(randomState());
  });
});

describe("authUrl", () => {
  test("có offline + consent + scope + state + PKCE S256", () => {
    const url = googleProvider.authUrl({
      scopes: ["a.readonly", "b.readonly"],
      state: "st",
      codeChallenge: "ch",
      redirectUri: CB,
    });
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("prompt")).toBe("consent");
    expect(u.searchParams.get("scope")).toBe("a.readonly b.readonly");
    expect(u.searchParams.get("state")).toBe("st");
    expect(u.searchParams.get("code_challenge")).toBe("ch");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("redirect_uri")).toBe(CB);
  });
  test("ném OAuthError khi chưa cấu hình", () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    expect(() =>
      googleProvider.authUrl({ scopes: [], state: "s", codeChallenge: "c", redirectUri: CB }),
    ).toThrow(OAuthError);
  });
});

describe("exchange", () => {
  test("gửi authorization_code + code_verifier + redirect_uri, trả tokens", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      fakeResponse(200, { access_token: "at", refresh_token: "rt", expires_in: 3600, scope: "s" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const tok = await googleProvider.exchange({ code: "code123", codeVerifier: "ver", redirectUri: CB });
    expect(tok.access_token).toBe("at");
    expect(tok.refresh_token).toBe("rt");
    const body = String((fetchMock.mock.calls[0][1] as RequestInit).body);
    expect(body).toContain("grant_type=authorization_code");
    expect(body).toContain("code=code123");
    expect(body).toContain("code_verifier=ver");
    expect(body).toContain(encodeURIComponent(CB));
  });
});

describe("refresh", () => {
  test("success trả access_token mới", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(200, { access_token: "new", expires_in: 3600 })));
    const tok = await googleProvider.refresh!("rt");
    expect(tok.access_token).toBe("new");
  });
  test("invalid_grant → OAuthError.invalidGrant=true", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(400, { error: "invalid_grant" })));
    await expect(googleProvider.refresh!("dead")).rejects.toMatchObject({
      name: "OAuthError",
      invalidGrant: true,
    });
  });
  test("lỗi khác → OAuthError.invalidGrant=false", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(500, { error: "server_error" })));
    await expect(googleProvider.refresh!("rt")).rejects.toMatchObject({ invalidGrant: false });
  });
  test("message lỗi không chứa client secret", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(400, { error: "invalid_grant" })));
    await expect(googleProvider.refresh!("dead")).rejects.toSatisfy(
      (e: Error) => !e.message.includes("secret"),
    );
  });
});

describe("enrich (parseIdTokenEmail)", () => {
  test("lấy email từ payload JWT → _account + google_email (back-compat)", async () => {
    const payload = Buffer.from(JSON.stringify({ email: "an@gmail.com" })).toString("base64url");
    const out = await googleProvider.enrich!({ access_token: "at", id_token: `h.${payload}.s` });
    expect(out).toEqual({ _account: "an@gmail.com", google_email: "an@gmail.com" });
  });
  test("null/hỏng → enrich rỗng", async () => {
    expect(parseIdTokenEmail(undefined)).toBeNull();
    expect(parseIdTokenEmail("garbage")).toBeNull();
    expect(await googleProvider.enrich!({ access_token: "at" })).toEqual({});
  });
});
