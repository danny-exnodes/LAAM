import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { slackProvider } from "./slack";

function fakeResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

const CB = "https://laam.example.ts.net/api/connectors/slack/callback";

beforeEach(() => {
  process.env.SLACK_CLIENT_ID = "slack-cid";
  process.env.SLACK_CLIENT_SECRET = "slack-secret";
  process.env.OAUTH_PUBLIC_BASE_URL = "https://laam.example.ts.net";
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.SLACK_CLIENT_ID;
  delete process.env.SLACK_CLIENT_SECRET;
  delete process.env.OAUTH_PUBLIC_BASE_URL;
});

describe("authUrl", () => {
  test("scope nối bằng DẤU PHẨY (quirk Slack) + state + redirect_uri", () => {
    const url = slackProvider.authUrl({
      scopes: ["channels:read", "chat:write"],
      state: "st",
      codeChallenge: "",
      redirectUri: CB,
    });
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://slack.com/oauth/v2/authorize");
    expect(u.searchParams.get("scope")).toBe("channels:read,chat:write");
    expect(u.searchParams.get("state")).toBe("st");
    expect(u.searchParams.get("redirect_uri")).toBe(CB);
    expect(slackProvider.pkce).toBe(false); // cố ý: bật PKCE là one-way sang public client
  });
});

describe("exchange", () => {
  test("form-encoded + Basic auth; HTTP 200 ok:true → tokens (không expires_in — token không hết hạn)", async () => {
    const fetchMock = vi.fn(async () =>
      fakeResponse(200, {
        ok: true,
        access_token: "xoxb-1",
        scope: "channels:read",
        bot_user_id: "U0BOT",
        team: { id: "T1", name: "Acme Team" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const tok = await slackProvider.exchange({ code: "c1", codeVerifier: "", redirectUri: CB });
    expect(tok.access_token).toBe("xoxb-1");
    expect(tok.expires_in).toBeUndefined();
    expect(tok.refresh_token).toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://slack.com/api/oauth.v2.access");
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(headers.Authorization).toBe(
      "Basic " + Buffer.from("slack-cid:slack-secret").toString("base64"),
    );
    expect(String(init.body)).toContain("code=c1");
  });
  test("HTTP 200 với ok:false → OAuthError mang đúng error code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(200, { ok: false, error: "invalid_code" })));
    await expect(
      slackProvider.exchange({ code: "bad", codeVerifier: "", redirectUri: CB }),
    ).rejects.toMatchObject({ name: "OAuthError", message: expect.stringContaining("invalid_code") });
  });
  test("message lỗi không chứa client secret", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(200, { ok: false, error: "bad_client_secret" })));
    await expect(
      slackProvider.exchange({ code: "c", codeVerifier: "", redirectUri: CB }),
    ).rejects.toSatisfy((e: Error) => !e.message.includes("slack-secret"));
  });
});

describe("no-refresh provider", () => {
  test("không có refresh() — framework passthrough, token xoxb không hết hạn", () => {
    expect(slackProvider.refresh).toBeUndefined();
  });
});

describe("enrich", () => {
  test("_account = team name từ raw exchange", async () => {
    const out = await slackProvider.enrich!({
      access_token: "xoxb-1",
      raw: { team_name: "Acme Team", bot_user_id: "U0BOT" },
    });
    expect(out._account).toBe("Acme Team");
    expect(out.slack_bot_user_id).toBe("U0BOT");
  });
});
