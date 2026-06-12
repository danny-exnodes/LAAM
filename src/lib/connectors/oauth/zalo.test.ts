import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { zaloProvider } from "./zalo";

function fakeResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

const CB = "https://laam.example.ts.net/api/connectors/zalo/callback";

beforeEach(() => {
  process.env.ZALO_APP_ID = "1234567890";
  process.env.ZALO_APP_SECRET = "zalo-secret";
  process.env.OAUTH_PUBLIC_BASE_URL = "https://laam.example.ts.net";
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.ZALO_APP_ID;
  delete process.env.ZALO_APP_SECRET;
  delete process.env.OAUTH_PUBLIC_BASE_URL;
});

describe("authUrl", () => {
  test("v4/oa/permission: app_id + redirect_uri + code_challenge (KHÔNG có code_challenge_method) + state", () => {
    const url = zaloProvider.authUrl({
      scopes: [],
      state: "st",
      codeChallenge: "ch",
      redirectUri: CB,
    });
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://oauth.zaloapp.com/v4/oa/permission");
    expect(u.searchParams.get("app_id")).toBe("1234567890");
    expect(u.searchParams.get("redirect_uri")).toBe(CB);
    expect(u.searchParams.get("code_challenge")).toBe("ch");
    expect(u.searchParams.get("code_challenge_method")).toBeNull(); // S256 implied — quirk Zalo
    expect(u.searchParams.get("state")).toBe("st");
    expect(u.searchParams.get("scope")).toBeNull(); // Zalo không có scope
  });
});

describe("exchange", () => {
  test("secret đi qua HEADER secret_key (KHÔNG nằm trong body); body form-encoded có code_verifier", async () => {
    const fetchMock = vi.fn(async () =>
      fakeResponse(200, { access_token: "za-at", refresh_token: "za-rt", expires_in: "90000" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const tok = await zaloProvider.exchange({ code: "c1", codeVerifier: "ver", redirectUri: CB });
    expect(tok.access_token).toBe("za-at");
    expect(tok.expires_in).toBe(90000); // chuỗi "90000" → số
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://oauth.zaloapp.com/v4/oa/access_token");
    const headers = init.headers as Record<string, string>;
    expect(headers.secret_key).toBe("zalo-secret");
    const body = String(init.body);
    expect(body).toContain("code=c1");
    expect(body).toContain("code_verifier=ver");
    expect(body).toContain("grant_type=authorization_code");
    expect(body).not.toContain("zalo-secret");
  });
});

describe("refresh (single-use rotation, TTL 3 tháng)", () => {
  test("trả refresh_token MỚI", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        fakeResponse(200, { access_token: "za-at2", refresh_token: "za-rt2", expires_in: 90000 }),
      ),
    );
    const tok = await zaloProvider.refresh!("za-rt1");
    expect(tok.refresh_token).toBe("za-rt2");
  });
  test("4xx/error không có token → OAuthError.invalidGrant=true (RT chết/đã dùng)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(400, { error: -14014, error_name: "Invalid refresh token" })));
    await expect(zaloProvider.refresh!("dead")).rejects.toMatchObject({
      name: "OAuthError",
      invalidGrant: true,
    });
  });
  test("5xx → transient (invalidGrant=false); message không chứa secret", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(503, null)));
    await expect(zaloProvider.refresh!("rt")).rejects.toSatisfy(
      (e: { invalidGrant: boolean; message: string }) =>
        e.invalidGrant === false && !e.message.includes("zalo-secret"),
    );
  });
  test("REVIEW-FIX: HTTP 200 + error field tường minh (quirk Zalo) → invalidGrant=true", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(200, { error: -14014, error_name: "Invalid refresh token" })));
    await expect(zaloProvider.refresh!("dead")).rejects.toMatchObject({ invalidGrant: true });
  });
  test("REVIEW-FIX: HTTP 200 nhưng body rỗng/hỏng (proxy junk) → transient, KHÔNG flag reconnect", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(200, null)));
    await expect(zaloProvider.refresh!("rt")).rejects.toMatchObject({ invalidGrant: false });
  });
});

describe("enrich", () => {
  test("_account = tên OA từ getoa (header access_token, không Bearer)", async () => {
    const fetchMock = vi.fn(async () =>
      fakeResponse(200, { error: 0, data: { name: "LAAM OA", oa_id: "999" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await zaloProvider.enrich!({ access_token: "za-at" });
    expect(out._account).toBe("LAAM OA");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain("openapi.zalo.me/v2.0/oa/getoa");
    expect((init.headers as Record<string, string>).access_token).toBe("za-at");
  });
  test("getoa lỗi → enrich rỗng (display-only, không chặn connect)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(200, { error: -201, message: "no package" })));
    expect(await zaloProvider.enrich!({ access_token: "za-at" })).toEqual({});
  });
});
