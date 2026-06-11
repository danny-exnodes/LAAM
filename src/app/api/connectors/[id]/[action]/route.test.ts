import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/connectors", () => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  testConnector: vi.fn(),
  isOAuthConnector: vi.fn(() => true),
  oauthScopes: vi.fn(() => []),
  saveGoogleTokens: vi.fn(),
}));
vi.mock("@/lib/connectors/google-oauth", () => ({
  googleOAuthConfig: vi.fn(() => ({})),
  buildAuthUrl: vi.fn(() => "https://accounts.google.com/o/oauth2/v2/auth"),
  exchangeCode: vi.fn(),
  randomState: vi.fn(() => "st"),
  pkcePair: vi.fn(() => ({ verifier: "v", challenge: "c" })),
  parseIdTokenEmail: vi.fn(),
}));

import { auth } from "@/auth";
import { connect, disconnect, testConnector, saveGoogleTokens } from "@/lib/connectors";
import { POST, GET } from "./route";

const mockAuth = vi.mocked(auth);
const mockConnect = vi.mocked(connect);
const mockDisconnect = vi.mocked(disconnect);
const mockTest = vi.mocked(testConnector);

function req(body: unknown = {}) {
  return new Request("http://localhost/api/connectors/github/connect", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function ctx(id: string, action: string) {
  return { params: Promise.resolve({ id, action }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
});

describe("POST /api/connectors/:id/:action", () => {
  test("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await POST(req(), ctx("github", "connect"));
    expect(res.status).toBe(401);
    expect(mockConnect).not.toHaveBeenCalled();
  });

  test("viewer → 403, connector never touched (real creds: connect/disconnect/test)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "viewer" } } as never);
    const res = await POST(req({ fields: { token: "ghp_x" } }), ctx("github", "connect"));
    expect(res.status).toBe(403);
    // No side effect: a read-only viewer cannot connect/disconnect/test live creds.
    expect(mockConnect).not.toHaveBeenCalled();
    expect(mockDisconnect).not.toHaveBeenCalled();
    expect(mockTest).not.toHaveBeenCalled();
  });

  test("connect dispatches to connect() with userId, id, fields", async () => {
    const fields = { token: "ghp_secret" };
    mockConnect.mockResolvedValue({ ok: true } as never);

    // The client wraps the field map in { fields } (see ConnectorsClient).
    const res = await POST(req({ fields }), ctx("github", "connect"));
    expect(mockConnect).toHaveBeenCalledWith("u1", "github", fields);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("connect response never echoes the submitted secret", async () => {
    mockConnect.mockResolvedValue({ ok: true } as never);
    const res = await POST(
      req({ fields: { token: "ghp_secret" } }),
      ctx("github", "connect"),
    );
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

describe("GET /api/connectors/:id/:action — OAuth flow gated for viewer", () => {
  function getReq(action: string) {
    return new Request(`http://localhost/api/connectors/google-drive/${action}`, { method: "GET" });
  }
  const mockSave = vi.mocked(saveGoogleTokens);

  test("viewer authorize → redirect to forbidden, never starts OAuth (live creds bypass closed)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "viewer" } } as never);
    const res = await GET(getReq("authorize"), ctx("google-drive", "authorize"));
    expect(res.status).toBe(307); // NextResponse.redirect
    expect(res.headers.get("location")).toContain("/connectors?error=forbidden");
  });

  test("viewer callback → redirect to forbidden, tokens never saved", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "viewer" } } as never);
    const res = await GET(getReq("callback"), ctx("google-drive", "callback"));
    expect(res.headers.get("location")).toContain("/connectors?error=forbidden");
    expect(mockSave).not.toHaveBeenCalled();
  });

  test("member authorize proceeds past the gate (not redirected to forbidden)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const res = await GET(getReq("authorize"), ctx("google-drive", "authorize"));
    expect(res.headers.get("location") ?? "").not.toContain("forbidden");
  });
});
