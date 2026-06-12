import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { atlassianProvider, ATLASSIAN_CREDS } from "./atlassian";
import { OAuthError } from "./types";

function fakeResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

const CB = "https://laam.example.ts.net/api/connectors/atlassian/callback";

beforeEach(() => {
  process.env.ATLASSIAN_OAUTH_CLIENT_ID = "atl-cid";
  process.env.ATLASSIAN_OAUTH_CLIENT_SECRET = "atl-secret";
  process.env.OAUTH_PUBLIC_BASE_URL = "https://laam.example.ts.net";
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.ATLASSIAN_OAUTH_CLIENT_ID;
  delete process.env.ATLASSIAN_OAUTH_CLIENT_SECRET;
  delete process.env.OAUTH_PUBLIC_BASE_URL;
});

describe("authUrl", () => {
  test("đủ 7 param bắt buộc, KHÔNG có PKCE (atlassian không hỗ trợ)", () => {
    const url = atlassianProvider.authUrl({
      scopes: ["read:jira-work", "offline_access"],
      state: "st",
      codeChallenge: "ch-must-be-ignored",
      redirectUri: CB,
    });
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://auth.atlassian.com/authorize");
    expect(u.searchParams.get("audience")).toBe("api.atlassian.com");
    expect(u.searchParams.get("client_id")).toBe("atl-cid");
    expect(u.searchParams.get("scope")).toBe("read:jira-work offline_access");
    expect(u.searchParams.get("redirect_uri")).toBe(CB);
    expect(u.searchParams.get("state")).toBe("st");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("prompt")).toBe("consent");
    expect(u.searchParams.get("code_challenge")).toBeNull(); // pkce=false
    expect(atlassianProvider.pkce).toBe(false);
  });
});

describe("exchange", () => {
  test("token endpoint nhận JSON (KHÔNG form-encoded — khác Google)", async () => {
    const fetchMock = vi.fn(async () =>
      fakeResponse(200, { access_token: "at", refresh_token: "rt", expires_in: 3600 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const tok = await atlassianProvider.exchange({ code: "c1", codeVerifier: "", redirectUri: CB });
    expect(tok.access_token).toBe("at");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://auth.atlassian.com/oauth/token");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(String(init.body))).toEqual({
      grant_type: "authorization_code",
      client_id: "atl-cid",
      client_secret: "atl-secret",
      code: "c1",
      redirect_uri: CB,
    });
  });
});

describe("refresh (rotating, single-use)", () => {
  test("trả refresh_token MỚI để framework persist ngay", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => fakeResponse(200, { access_token: "at2", refresh_token: "rt2", expires_in: 3600 })),
    );
    const tok = await atlassianProvider.refresh!("rt1");
    expect(tok.refresh_token).toBe("rt2");
  });
  test("invalid_grant → OAuthError.invalidGrant=true", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(403, { error: "invalid_grant" })));
    await expect(atlassianProvider.refresh!("dead")).rejects.toMatchObject({
      name: "OAuthError",
      invalidGrant: true,
    });
  });
  test("5xx → transient (invalidGrant=false), message không chứa secret", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(500, null)));
    await expect(atlassianProvider.refresh!("rt")).rejects.toSatisfy(
      (e: OAuthError) => e.invalidGrant === false && !e.message.includes("atl-secret"),
    );
  });
});

describe("enrich (accessible-resources → cloud_id/site_url)", () => {
  test("ghi cloud_id + site_url theo hằng ATLASSIAN_CREDS; _account best-effort từ /me", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("accessible-resources")) {
        return fakeResponse(200, [{ id: "cloud-1", url: "https://acme.atlassian.net", name: "acme" }]);
      }
      return fakeResponse(200, { email: "an@acme.com", name: "An" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await atlassianProvider.enrich!({ access_token: "at" });
    expect(out[ATLASSIAN_CREDS.cloudId]).toBe("cloud-1");
    expect(out[ATLASSIAN_CREDS.siteUrl]).toBe("https://acme.atlassian.net");
    expect(out._account).toBe("an@acme.com");
  });
  test("/me lỗi → vẫn trả cloud_id (account chỉ là hiển thị)", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("accessible-resources")) {
        return fakeResponse(200, [{ id: "cloud-1", url: "https://acme.atlassian.net" }]);
      }
      return fakeResponse(403, { error: "forbidden" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await atlassianProvider.enrich!({ access_token: "at" });
    expect(out[ATLASSIAN_CREDS.cloudId]).toBe("cloud-1");
    expect(out._account).toBeUndefined();
  });
  test("không có site nào → ném OAuthError (cloud_id là bắt buộc để gọi API)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(200, [])));
    await expect(atlassianProvider.enrich!({ access_token: "at" })).rejects.toThrow(OAuthError);
  });
});
