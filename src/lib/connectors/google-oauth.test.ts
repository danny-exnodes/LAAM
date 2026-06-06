import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "crypto";
import {
  googleOAuthConfig,
  pkcePair,
  randomState,
  buildAuthUrl,
  exchangeCode,
  refreshAccessToken,
  parseIdTokenEmail,
  GoogleAuthError,
} from "./google-oauth";

function fakeResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

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

describe("googleOAuthConfig", () => {
  test("null khi thiếu env", () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    expect(googleOAuthConfig()).toBeNull();
  });
  test("compose redirectUri + trim trailing slash", () => {
    const cfg = googleOAuthConfig();
    expect(cfg?.redirectUri).toBe("https://laam.example.ts.net/api/connectors/google/callback");
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

describe("buildAuthUrl", () => {
  test("có offline + consent + scope + state + PKCE S256", () => {
    const url = buildAuthUrl({ scopes: ["a.readonly", "b.readonly"], state: "st", codeChallenge: "ch" });
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("prompt")).toBe("consent");
    expect(u.searchParams.get("scope")).toBe("a.readonly b.readonly");
    expect(u.searchParams.get("state")).toBe("st");
    expect(u.searchParams.get("code_challenge")).toBe("ch");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("redirect_uri")).toContain("/api/connectors/google/callback");
  });
  test("ném khi chưa cấu hình", () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    expect(() => buildAuthUrl({ scopes: [], state: "s", codeChallenge: "c" })).toThrow(GoogleAuthError);
  });
});

describe("exchangeCode", () => {
  test("gửi authorization_code + code_verifier, trả tokens", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      fakeResponse(200, { access_token: "at", refresh_token: "rt", expires_in: 3600, scope: "s" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const tok = await exchangeCode({ code: "code123", codeVerifier: "ver" });
    expect(tok.access_token).toBe("at");
    expect(tok.refresh_token).toBe("rt");
    const body = String((fetchMock.mock.calls[0][1] as RequestInit).body);
    expect(body).toContain("grant_type=authorization_code");
    expect(body).toContain("code=code123");
    expect(body).toContain("code_verifier=ver");
  });
});

describe("refreshAccessToken", () => {
  test("success trả access_token mới", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(200, { access_token: "new", expires_in: 3600 })));
    const tok = await refreshAccessToken("rt");
    expect(tok.access_token).toBe("new");
  });
  test("invalid_grant → GoogleAuthError.invalidGrant=true", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(400, { error: "invalid_grant" })));
    await expect(refreshAccessToken("dead")).rejects.toMatchObject({
      name: "GoogleAuthError",
      invalidGrant: true,
    });
  });
  test("lỗi khác → GoogleAuthError.invalidGrant=false", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(500, { error: "server_error" })));
    await expect(refreshAccessToken("rt")).rejects.toMatchObject({ invalidGrant: false });
  });
});

describe("parseIdTokenEmail", () => {
  test("lấy email từ payload JWT", () => {
    const payload = Buffer.from(JSON.stringify({ email: "an@gmail.com" })).toString("base64url");
    expect(parseIdTokenEmail(`h.${payload}.s`)).toBe("an@gmail.com");
  });
  test("null khi thiếu / hỏng", () => {
    expect(parseIdTokenEmail(undefined)).toBeNull();
    expect(parseIdTokenEmail("garbage")).toBeNull();
  });
});
