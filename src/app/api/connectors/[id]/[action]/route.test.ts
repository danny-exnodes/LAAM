import { describe, expect, test, vi, beforeEach } from "vitest";
import { encryptJson } from "@/lib/connectors/crypto";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/connectors", () => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  testConnector: vi.fn(),
  isOAuthConnector: vi.fn(() => true),
  oauthScopes: vi.fn(() => ["scope.a"]),
  oauthProviderOf: vi.fn(() => "google"),
  saveOAuthTokens: vi.fn(),
  saveTrelloToken: vi.fn(),
}));

// Controllable provider registry: one fake provider observed by the route.
const { exchangeMock, authUrlMock } = vi.hoisted(() => ({
  exchangeMock: vi.fn(),
  authUrlMock: vi.fn(
    (_o: { scopes: string[]; state: string; codeChallenge: string; redirectUri: string }) =>
      "https://provider.example/consent",
  ),
}));
vi.mock("@/lib/connectors/oauth/registry", () => ({
  PROVIDERS: {
    google: {
      id: "google",
      pkce: true,
      configured: () => true,
      authUrl: authUrlMock,
      exchange: exchangeMock,
    },
  },
}));
vi.mock("@/lib/connectors/oauth/trello", () => ({
  trelloApiKey: vi.fn(() => "op-key"),
  trelloAuthorizeUrl: vi.fn(() => "https://trello.com/1/authorize?key=op-key"),
  trelloVerifyToken: vi.fn(async () => ({ ok: true, username: "danny" })),
}));

// In-memory cookie jar for next/headers (the route reads the state cookie from
// the REQUEST via cookies(); responses carry Set-Cookie separately).
const { cookieJar } = vi.hoisted(() => ({ cookieJar: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
    getAll: () => [...cookieJar.entries()].map(([name, value]) => ({ name, value })),
  }),
}));

import { auth } from "@/auth";
import {
  connect,
  disconnect,
  testConnector,
  oauthProviderOf,
  saveOAuthTokens,
  saveTrelloToken,
} from "@/lib/connectors";
import { trelloVerifyToken } from "@/lib/connectors/oauth/trello";
import { POST, GET } from "./route";

const mockAuth = vi.mocked(auth);
const mockConnect = vi.mocked(connect);
const mockDisconnect = vi.mocked(disconnect);
const mockTest = vi.mocked(testConnector);
const mockProviderOf = vi.mocked(oauthProviderOf);
const mockSave = vi.mocked(saveOAuthTokens);
const mockSaveTrello = vi.mocked(saveTrelloToken);
const mockVerifyTrello = vi.mocked(trelloVerifyToken);

function req(body: unknown = {}) {
  return new Request("http://localhost/api/connectors/github/connect", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function ctx(id: string, action: string) {
  return { params: Promise.resolve({ id, action }) };
}

function stateCookie(connectorId: string, state = "st", expOffset = 600_000) {
  cookieJar.set(
    "laam_oauth_" + connectorId,
    encryptJson({ state, codeVerifier: "ver", connectorId, exp: Date.now() + expOffset }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  cookieJar.clear();
  process.env.OAUTH_PUBLIC_BASE_URL = "https://laam.example.ts.net";
  mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
  mockProviderOf.mockReturnValue("google");
  authUrlMock.mockReturnValue("https://provider.example/consent");
  exchangeMock.mockResolvedValue({ access_token: "at", refresh_token: "rt", expires_in: 3600 });
});

describe("POST /api/connectors/:id/:action", () => {
  test("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await POST(req(), ctx("github", "connect"));
    expect(res.status).toBe(401);
    expect(mockConnect).not.toHaveBeenCalled();
  });

  test("viewer → 403, connector never touched (real creds: connect/disconnect/test/capture)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "viewer" } } as never);
    const res = await POST(req({ fields: { token: "ghp_x" } }), ctx("github", "connect"));
    expect(res.status).toBe(403);
    expect(mockConnect).not.toHaveBeenCalled();
    expect(mockDisconnect).not.toHaveBeenCalled();
    expect(mockTest).not.toHaveBeenCalled();
    // capture is creds-touching too — same gate
    const cap = await POST(req({ token: "t" }), ctx("trello", "capture"));
    expect(cap.status).toBe(403);
    expect(mockSaveTrello).not.toHaveBeenCalled();
  });

  test("connect dispatches to connect() with userId, id, fields", async () => {
    const fields = { token: "ghp_secret" };
    mockConnect.mockResolvedValue({ ok: true } as never);
    const res = await POST(req({ fields }), ctx("github", "connect"));
    expect(mockConnect).toHaveBeenCalledWith("u1", "github", fields);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("connect response never echoes the submitted secret", async () => {
    mockConnect.mockResolvedValue({ ok: true } as never);
    const res = await POST(req({ fields: { token: "ghp_secret" } }), ctx("github", "connect"));
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("ghp_secret");
  });

  test("disconnect dispatches to disconnect() with userId, id", async () => {
    mockDisconnect.mockResolvedValue({ ok: true } as never);
    const res = await POST(req(), ctx("github", "disconnect"));
    expect(mockDisconnect).toHaveBeenCalledWith("u1", "github");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("test dispatches to testConnector() with userId, id", async () => {
    mockTest.mockResolvedValue({ ok: true, info: "ok" } as never);
    const res = await POST(req(), ctx("github", "test"));
    expect(mockTest).toHaveBeenCalledWith("u1", "github");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, info: "ok" });
  });

  test("unknown action → 400, no framework fn called", async () => {
    const res = await POST(req(), ctx("github", "explode"));
    expect(res.status).toBe(400);
    expect(mockConnect).not.toHaveBeenCalled();
    expect(mockDisconnect).not.toHaveBeenCalled();
    expect(mockTest).not.toHaveBeenCalled();
  });
});

describe("POST trello/capture — verify-before-persist + flow-proof cookie", () => {
  test("không có cookie authorize → 400, token KHÔNG được lưu", async () => {
    const res = await POST(req({ token: "captured" }), ctx("trello", "capture"));
    expect(res.status).toBe(400);
    expect(mockSaveTrello).not.toHaveBeenCalled();
  });

  test("cookie hết hạn → 400", async () => {
    stateCookie("trello", "st", -1000);
    const res = await POST(req({ token: "captured" }), ctx("trello", "capture"));
    expect(res.status).toBe(400);
    expect(mockSaveTrello).not.toHaveBeenCalled();
  });

  test("token không verify được (giả mạo) → 400, KHÔNG persist", async () => {
    stateCookie("trello");
    mockVerifyTrello.mockResolvedValueOnce({ ok: false, error: "token không hợp lệ (HTTP 401)" });
    const res = await POST(req({ token: "forged" }), ctx("trello", "capture"));
    expect(res.status).toBe(400);
    expect(mockSaveTrello).not.toHaveBeenCalled();
  });

  test("flow đầy đủ: verify OK → saveTrelloToken(userId, token, key env)", async () => {
    stateCookie("trello");
    const res = await POST(req({ token: "captured" }), ctx("trello", "capture"));
    expect(res.status).toBe(200);
    expect(mockVerifyTrello).toHaveBeenCalledWith("captured");
    expect(mockSaveTrello).toHaveBeenCalledWith("u1", "captured", "op-key");
  });

  test("capture cho connector khác trello → 400", async () => {
    const res = await POST(req({ token: "t" }), ctx("github", "capture"));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/connectors/:id/:action — authorize", () => {
  function getReq(id: string, action: string, qs = "") {
    return new Request(`http://localhost/api/connectors/${id}/${action}${qs}`, { method: "GET" });
  }

  test("viewer authorize → redirect to forbidden, never starts OAuth (live creds bypass closed)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "viewer" } } as never);
    const res = await GET(getReq("google-drive", "authorize"), ctx("google-drive", "authorize"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/connectors?error=forbidden");
  });

  test("member authorize → redirect tới provider + set state cookie laam_oauth_<connector>", async () => {
    const res = await GET(getReq("google-drive", "authorize"), ctx("google-drive", "authorize"));
    expect(res.headers.get("location")).toBe("https://provider.example/consent");
    expect(res.headers.get("set-cookie")).toContain("laam_oauth_google-drive=");
    // PKCE provider → a non-empty challenge was passed
    const args = authUrlMock.mock.calls[0][0];
    expect(args.codeChallenge.length).toBeGreaterThan(10);
    expect(args.redirectUri).toBe("https://laam.example.ts.net/api/connectors/google/callback");
  });

  test("trello authorize → redirect tới trello.com (accelerator, không phải provider OAuth)", async () => {
    const res = await GET(getReq("trello", "authorize"), ctx("trello", "authorize"));
    expect(res.headers.get("location")).toContain("https://trello.com/1/authorize");
    expect(res.headers.get("set-cookie")).toContain("laam_oauth_trello=");
  });
});

describe("GET callback — state-cookie scan + provider/connector agreement", () => {
  function cbReq(provider: string, qs: string) {
    return new Request(`http://localhost/api/connectors/${provider}/callback${qs}`, { method: "GET" });
  }

  test("viewer callback → forbidden, tokens never saved", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "viewer" } } as never);
    const res = await GET(cbReq("google", "?code=c&state=st"), ctx("google", "callback"));
    expect(res.headers.get("location")).toContain("/connectors?error=forbidden");
    expect(mockSave).not.toHaveBeenCalled();
  });

  test("state khớp cookie → exchange + saveOAuthTokens dưới connectorId trong cookie", async () => {
    stateCookie("google-drive", "st");
    const res = await GET(cbReq("google", "?code=c1&state=st"), ctx("google", "callback"));
    expect(exchangeMock).toHaveBeenCalledWith(
      expect.objectContaining({ code: "c1", codeVerifier: "ver" }),
    );
    expect(mockSave).toHaveBeenCalledWith(
      "u1",
      "google-drive",
      "google",
      expect.objectContaining({ access_token: "at" }),
    );
    expect(res.headers.get("location")).toContain("connected=google-drive");
    // REVIEW-FIX 06-12: deletion phải lặp lại đúng Path lúc set — delete mặc định
    // Path=/ là cookie KHÁC, cookie gốc sống tới hết maxAge (single-use vô hiệu).
    const setCookie = res.headers.get("set-cookie") || "";
    expect(setCookie).toContain("laam_oauth_google-drive=");
    expect(setCookie.toLowerCase()).toContain("path=/api/connectors");
  });

  test("state không khớp → oauth_state, không exchange (CSRF fail-closed)", async () => {
    stateCookie("google-drive", "real-state");
    const res = await GET(cbReq("google", "?code=c1&state=WRONG"), ctx("google", "callback"));
    expect(res.headers.get("location")).toContain("error=oauth_state");
    expect(exchangeMock).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  test("provider/connector bất đồng (cookie jira nhưng URL google) → fail-closed, không persist (§12.8)", async () => {
    stateCookie("jira", "st");
    mockProviderOf.mockReturnValue("atlassian"); // jira's real provider ≠ URL provider google
    const res = await GET(cbReq("google", "?code=c1&state=st"), ctx("google", "callback"));
    expect(res.headers.get("location")).toContain("error=oauth_state");
    expect(exchangeMock).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  test("2 flow song song: callback chỉ consume cookie của MÌNH (match theo state)", async () => {
    stateCookie("google-drive", "state-A");
    stateCookie("gmail", "state-B");
    await GET(cbReq("google", "?code=c1&state=state-B"), ctx("google", "callback"));
    expect(mockSave).toHaveBeenCalledWith("u1", "gmail", "google", expect.anything());
  });

  test("provider deny (?error=) → oauth_denied", async () => {
    stateCookie("google-drive", "st");
    const res = await GET(cbReq("google", "?error=access_denied&state=st"), ctx("google", "callback"));
    expect(res.headers.get("location")).toContain("error=oauth_denied");
    expect(mockSave).not.toHaveBeenCalled();
  });

  test("cookie hết hạn → oauth_expired", async () => {
    stateCookie("google-drive", "st", -1000);
    const res = await GET(cbReq("google", "?code=c1&state=st"), ctx("google", "callback"));
    expect(res.headers.get("location")).toContain("error=oauth_expired");
    expect(mockSave).not.toHaveBeenCalled();
  });
});
