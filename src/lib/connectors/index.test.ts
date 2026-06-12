import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Connector } from "./types";
import { OAuthError } from "./oauth/types";

// In-memory creds keyed by `${userId}:${id}`. Built inside vi.hoisted so the
// mocked store can reference them (vi.mock is hoisted above declarations).
const { memCreds, getCreds, setCreds, delCreds } = vi.hoisted(() => {
  const memCreds: Record<string, Record<string, string> | null> = {};
  return {
    memCreds,
    getCreds: vi.fn(async (u: string, id: string) => memCreds[`${u}:${id}`] ?? null),
    setCreds: vi.fn(async (u: string, id: string, c: Record<string, string>) => {
      memCreds[`${u}:${id}`] = c;
    }),
    delCreds: vi.fn(async (u: string, id: string) => {
      memCreds[`${u}:${id}`] = null;
    }),
  };
});
vi.mock("./store", () => ({ getCreds, setCreds, delCreds }));

// The advisory lock touches Postgres — passthrough in unit tests (the lock's
// correctness is a DB concern; the double-check + persist logic IS under test).
// fn receives the lock's tx executor — the mocked store ignores it.
vi.mock("./oauth/lock", () => ({
  withCredLock: (_u: string, _id: string, fn: (tx: unknown) => Promise<unknown>) => fn({}),
}));

// Fake OAuth providers: atlassian-like (rotating refresh) + slack-like (no
// refresh). Hoisted so both the oauth/registry mock and tests share them.
const { refreshMock, enrichMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  enrichMock: vi.fn(async () => ({}) as Record<string, string>),
}));
vi.mock("./oauth/registry", () => ({
  PROVIDERS: {
    atlassian: {
      id: "atlassian",
      pkce: false,
      configured: () => true,
      refresh: refreshMock,
      enrich: enrichMock,
    },
    slack: {
      id: "slack",
      pkce: false,
      configured: () => false,
      // no refresh: xoxb tokens don't expire
    },
  },
}));

// Fake registry: token connector + demo + dual-mode oauth (jira-like) +
// field-less oauth (slack-like) + trello (token + accelerator special-case).
const { github, demo, jiraLike, slackLike, trelloLike } = vi.hoisted(() => {
  const github: Connector = {
    id: "github",
    name: "GitHub",
    icon: "github",
    blurb: "Repos",
    auth: { type: "token", help: "h", setup: "", fields: [{ key: "token", label: "Token", secret: true }] },
    tools: [{ type: "function", kind: "read", function: { name: "github_list_repos", description: "d", parameters: {} } }],
    handlers: { github_list_repos: vi.fn(async () => ({ repos: ["a"] })) },
    test: vi.fn(async () => ({ ok: true, info: "ok" })),
  };
  const demo: Connector = {
    id: "demo",
    name: "Demo",
    icon: "play",
    blurb: "Demo",
    auth: { type: "none" },
    tools: [{ type: "function", kind: "read", function: { name: "demo_list_tasks", description: "d", parameters: {} } }],
    handlers: { demo_list_tasks: vi.fn(async () => ({ tasks: [] })) },
  };
  const jiraLike: Connector = {
    id: "jira",
    name: "Jira",
    icon: "list",
    blurb: "Issues",
    auth: {
      type: "oauth",
      provider: "atlassian",
      scopes: ["read:jira-work"],
      help: "h",
      fields: [
        { key: "site", label: "Site" },
        { key: "email", label: "Email" },
        { key: "api_token", label: "Token", secret: true },
      ],
    },
    tools: [{ type: "function", kind: "read", function: { name: "jira_echo", description: "d", parameters: {} } }],
    handlers: { jira_echo: vi.fn(async (_a, creds) => ({ got: creds })) },
  };
  const slackLike: Connector = {
    id: "slack",
    name: "Slack",
    icon: "message-square",
    blurb: "Chat",
    auth: { type: "oauth", provider: "slack", scopes: ["chat:write"], help: "h" },
    tools: [{ type: "function", kind: "read", function: { name: "slack_echo", description: "d", parameters: {} } }],
    handlers: { slack_echo: vi.fn(async (_a, creds) => ({ got: creds })) },
  };
  const trelloLike: Connector = {
    id: "trello",
    name: "Trello",
    icon: "clipboard-list",
    blurb: "Boards",
    auth: {
      type: "token",
      help: "h",
      fields: [
        { key: "key", label: "API Key", secret: true },
        { key: "token", label: "Token", secret: true },
      ],
    },
    tools: [{ type: "function", kind: "read", function: { name: "trello_echo", description: "d", parameters: {} } }],
    handlers: { trello_echo: vi.fn(async () => ({ ok: true })) },
  };
  return { github, demo, jiraLike, slackLike, trelloLike };
});
vi.mock("./registry", () => ({ CONNECTORS: [github, demo, jiraLike, slackLike, trelloLike] }));

import {
  list,
  isConnected,
  connect,
  disconnect,
  testConnector,
  chatTools,
  execute,
  saveOAuthTokens,
  saveTrelloToken,
} from "./index";

const FUTURE = new Date(Date.now() + 3600_000).toISOString();
const PAST = new Date(Date.now() - 1000).toISOString();

beforeEach(() => {
  for (const k of Object.keys(memCreds)) delete memCreds[k];
  getCreds.mockClear();
  setCreds.mockClear();
  delCreds.mockClear();
  refreshMock.mockReset();
  enrichMock.mockClear();
  enrichMock.mockResolvedValue({});
  (github.handlers.github_list_repos as ReturnType<typeof vi.fn>).mockClear();
  (jiraLike.handlers.jira_echo as ReturnType<typeof vi.fn>).mockClear();
});

afterEach(() => {
  delete process.env.TRELLO_API_KEY;
  delete process.env.OAUTH_PUBLIC_BASE_URL;
});

describe("isConnected", () => {
  test("token connector: false when field missing, true when set", async () => {
    expect(await isConnected("u1", "github")).toBe(false);
    memCreds["u1:github"] = { token: "ghp_x" };
    expect(await isConnected("u1", "github")).toBe(true);
  });
  test("no-auth/demo connector: connected only via _connected flag", async () => {
    expect(await isConnected("u1", "demo")).toBe(false);
    memCreds["u1:demo"] = { _connected: "true" };
    expect(await isConnected("u1", "demo")).toBe(true);
  });
  test("unknown connector → false", async () => {
    expect(await isConnected("u1", "nope")).toBe(false);
  });
});

describe("connectionStatus — oauth matrix (spec 2026-06-12 §12.1)", () => {
  test("BLOCKER guard: oauth KHÔNG fields + creds rỗng → disconnected (không vacuously-true)", async () => {
    memCreds["u1:slack"] = {};
    expect(await isConnected("u1", "slack")).toBe(false);
    const item = (await list("u1")).find((i) => i.id === "slack")!;
    expect(item.status).toBe("disconnected");
  });
  test("oauth đủ grant (refresh-provider cần refresh_token) → connected", async () => {
    memCreds["u1:jira"] = { _connected: "true", access_token: "at", refresh_token: "rt" };
    expect(await isConnected("u1", "jira")).toBe(true);
  });
  test("oauth thiếu refresh_token với provider có refresh → disconnected", async () => {
    memCreds["u1:jira"] = { _connected: "true", access_token: "at" };
    expect(await isConnected("u1", "jira")).toBe(false);
  });
  test("no-refresh provider (slack): chỉ cần access_token + _connected", async () => {
    memCreds["u1:slack"] = { _connected: "true", access_token: "xoxb" };
    expect(await isConnected("u1", "slack")).toBe(true);
  });
  test("dual-mode: manual fields đủ bộ → connected (không cần grant)", async () => {
    memCreds["u1:jira"] = { site: "a.atlassian.net", email: "e@x.com", api_token: "t" };
    expect(await isConnected("u1", "jira")).toBe(true);
  });
  test("_needsReconnect → needs_reconnect (cả token-type trello sau thu hồi)", async () => {
    memCreds["u1:jira"] = { _connected: "true", access_token: "at", refresh_token: "rt", _needsReconnect: "true" };
    expect((await list("u1")).find((i) => i.id === "jira")!.status).toBe("needs_reconnect");
    memCreds["u1:trello"] = { key: "k", token: "t", _needsReconnect: "true" };
    expect((await list("u1")).find((i) => i.id === "trello")!.status).toBe("needs_reconnect");
  });
});

describe("list", () => {
  test("masks secret fields (keep last 4), reports connected + tools", async () => {
    memCreds["u1:github"] = { token: "ghp_secretXYZ9", _connectedAt: "2026-06-03T00:00:00Z" };
    const items = await list("u1");
    const gh = items.find((i) => i.id === "github")!;
    expect(gh.connected).toBe(true);
    // #1: the projection now carries each tool's schema (name + description + params)
    expect(gh.tools).toEqual([{ name: "github_list_repos", description: "d", parameters: {} }]);
    expect(gh.connectedAt).toBe("2026-06-03T00:00:00Z");
    const f = gh.auth.fields[0];
    expect(f.set).toBe(true);
    expect(f.masked).toBe("••••XYZ9"); // last 4
    expect(f.masked).not.toContain("ghp_secret");
  });
  test("scopes to the given user (no creds → not connected, empty mask)", async () => {
    const items = await list("u2");
    const gh = items.find((i) => i.id === "github")!;
    expect(gh.connected).toBe(false);
    expect(gh.auth.fields[0].set).toBe(false);
    expect(gh.auth.fields[0].masked).toBe("");
  });
  test("oauthConfigured: theo provider.configured(); trello theo env accelerator; token thường = false", async () => {
    const items = await list("u1");
    expect(items.find((i) => i.id === "jira")!.auth.oauthConfigured).toBe(true); // fake atlassian configured
    expect(items.find((i) => i.id === "slack")!.auth.oauthConfigured).toBe(false);
    expect(items.find((i) => i.id === "github")!.auth.oauthConfigured).toBe(false);
    expect(items.find((i) => i.id === "trello")!.auth.oauthConfigured).toBe(false);
    process.env.TRELLO_API_KEY = "k";
    process.env.OAUTH_PUBLIC_BASE_URL = "https://x.ts.net";
    expect((await list("u1")).find((i) => i.id === "trello")!.auth.oauthConfigured).toBe(true);
  });
  test("account ưu tiên _account, fallback google_email (back-compat)", async () => {
    memCreds["u1:jira"] = { _connected: "true", access_token: "at", refresh_token: "rt", _account: "An" };
    memCreds["u1:slack"] = { _connected: "true", access_token: "x", google_email: "old@gmail.com" };
    const items = await list("u1");
    expect(items.find((i) => i.id === "jira")!.account).toBe("An");
    expect(items.find((i) => i.id === "slack")!.account).toBe("old@gmail.com");
  });
});

describe("connect / disconnect", () => {
  test("connect stores trimmed token fields", async () => {
    const r = await connect("u1", "github", { token: "  ghp_x  " });
    expect(r.ok).toBe(true);
    expect(memCreds["u1:github"]!.token).toBe("ghp_x");
    expect(memCreds["u1:github"]!._connectedAt).toBeTruthy();
  });
  test("connect a no-auth connector sets _connected flag", async () => {
    await connect("u1", "demo", {});
    expect(memCreds["u1:demo"]!._connected).toBe("true");
  });
  test("connect unknown connector → error", async () => {
    const r = await connect("u1", "nope", {});
    expect(r.ok).toBe(false);
  });
  test("oauth KHÔNG fields → connect bị chặn (chỉ redirect flow)", async () => {
    const r = await connect("u1", "slack", { whatever: "x" });
    expect(r.ok).toBe(false);
  });
  test("dual-mode manual save đủ bộ: strip keys oauth, KHÔNG set _connected, xoá _needsReconnect (§12.5a)", async () => {
    memCreds["u1:jira"] = {
      _connected: "true",
      access_token: "at",
      refresh_token: "rt",
      cloud_id: "c1",
      site_url: "https://a.atlassian.net",
      _account: "An",
      _needsReconnect: "true",
    };
    const r = await connect("u1", "jira", { site: "b.atlassian.net", email: "e@x.com", api_token: "tok" });
    expect(r.ok).toBe(true);
    const saved = memCreds["u1:jira"]!;
    expect(saved.site).toBe("b.atlassian.net");
    expect(saved.access_token).toBeUndefined();
    expect(saved.refresh_token).toBeUndefined();
    expect(saved.cloud_id).toBeUndefined();
    expect(saved._connected).toBeUndefined();
    expect(saved._needsReconnect).toBeUndefined();
  });
  test("disconnect removes creds", async () => {
    memCreds["u1:github"] = { token: "ghp_x" };
    const r = await disconnect("u1", "github");
    expect(r.ok).toBe(true);
    expect(delCreds).toHaveBeenCalledWith("u1", "github");
  });
});

describe("testConnector", () => {
  test("not connected → error", async () => {
    const r = await testConnector("u1", "github");
    expect(r.ok).toBe(false);
  });
  test("connected → runs connector.test with decrypted creds", async () => {
    memCreds["u1:github"] = { token: "ghp_x" };
    const r = await testConnector("u1", "github");
    expect(r.ok).toBe(true);
    expect(r.info).toBe("ok");
    expect(github.test).toHaveBeenCalledWith({ token: "ghp_x" });
  });
  test("connector without test() → ok with note", async () => {
    memCreds["u1:demo"] = { _connected: "true" };
    const r = await testConnector("u1", "demo");
    expect(r.ok).toBe(true);
  });
  test("test() ném OAuthError(invalidGrant) → needs_reconnect được set (§12.6)", async () => {
    memCreds["u1:github"] = { token: "ghp_x" };
    (github.test as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new OAuthError("invalid token", true));
    const r = await testConnector("u1", "github");
    expect(r.ok).toBe(false);
    expect(memCreds["u1:github"]!._needsReconnect).toBe("true");
  });
});

describe("chatTools", () => {
  test("returns tools of only the user's connected connectors", async () => {
    expect(await chatTools("u1")).toEqual([]);
    memCreds["u1:github"] = { token: "ghp_x" };
    const tools = await chatTools("u1");
    expect(tools.map((t) => t.function.name)).toEqual(["github_list_repos"]);
  });
});

describe("execute", () => {
  test("unknown tool → error object", async () => {
    const r = (await execute("u1", "nope_tool", {})) as { error?: string };
    expect(r.error).toBeTruthy();
  });
  test("tool of a not-connected connector → error", async () => {
    const r = (await execute("u1", "github_list_repos", {})) as { error?: string };
    expect(r.error).toBeTruthy();
  });
  test("runs the handler with parsed args + decrypted creds", async () => {
    memCreds["u1:github"] = { token: "ghp_x" };
    const r = await execute("u1", "github_list_repos", '{"q":"x"}');
    expect(r).toEqual({ repos: ["a"] });
    expect(github.handlers.github_list_repos).toHaveBeenCalledWith({ q: "x" }, { token: "ghp_x" });
  });
  test("handler throw → error object (does not throw)", async () => {
    memCreds["u1:github"] = { token: "ghp_x" };
    (github.handlers.github_list_repos as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("boom"));
    const r = (await execute("u1", "github_list_repos", {})) as { error?: string };
    expect(r.error).toContain("boom");
  });
  test("handler ném OAuthError(invalidGrant) → error + _needsReconnect (thu hồi call-time §12.6)", async () => {
    memCreds["u1:github"] = { token: "ghp_x" };
    (github.handlers.github_list_repos as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new OAuthError("invalid token", true),
    );
    const r = (await execute("u1", "github_list_repos", {})) as { error?: string };
    expect(r.error).toContain("thu hồi");
    expect(memCreds["u1:github"]!._needsReconnect).toBe("true");
  });
  test("REVIEW-FIX: thu hồi call-time nhưng row đã bị disconnect → KHÔNG tái tạo row needs_reconnect", async () => {
    memCreds["u1:github"] = { token: "ghp_x" };
    (github.handlers.github_list_repos as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new OAuthError("invalid token", true),
    );
    // call 1 = initial read; call 2 = flagReconnectOnRevoke re-read → đã disconnect
    getCreds
      .mockImplementationOnce(async (u: string, id: string) => memCreds[`${u}:${id}`] ?? null)
      .mockImplementationOnce(async () => null);
    const r = (await execute("u1", "github_list_repos", {})) as { error?: string };
    expect(r.error).toBeTruthy();
    expect(setCreds).not.toHaveBeenCalled(); // không hồi sinh row {_needsReconnect} sau disconnect
  });
});

describe("ensureFreshOAuthCreds qua execute — refresh matrix (§12.2/§12.5)", () => {
  test("manual-mode (dual-mode jira): passthrough, KHÔNG gọi refresh", async () => {
    memCreds["u1:jira"] = { site: "a.atlassian.net", email: "e@x.com", api_token: "t" };
    const r = (await execute("u1", "jira_echo", {})) as { got: Record<string, string> };
    expect(r.got.api_token).toBe("t");
    expect(refreshMock).not.toHaveBeenCalled();
  });
  test("token còn hạn (>60s) → không refresh", async () => {
    memCreds["u1:jira"] = { _connected: "true", access_token: "at", refresh_token: "rt", expiry_at: FUTURE };
    const r = (await execute("u1", "jira_echo", {})) as { got: Record<string, string> };
    expect(r.got.access_token).toBe("at");
    expect(refreshMock).not.toHaveBeenCalled();
  });
  test("token hết hạn → refresh, persist NGAY refresh_token mới (rotation single-use)", async () => {
    memCreds["u1:jira"] = { _connected: "true", access_token: "old", refresh_token: "rt1", expiry_at: PAST };
    refreshMock.mockResolvedValueOnce({ access_token: "new", refresh_token: "rt2", expires_in: 3600 });
    const r = (await execute("u1", "jira_echo", {})) as { got: Record<string, string> };
    expect(r.got.access_token).toBe("new");
    expect(memCreds["u1:jira"]!.refresh_token).toBe("rt2"); // persisted before handler ran
  });
  test("invalid_grant + manual fields đủ → strip oauth keys, chạy tiếp manual-mode, KHÔNG needs_reconnect (§12.5c)", async () => {
    memCreds["u1:jira"] = {
      _connected: "true",
      access_token: "old",
      refresh_token: "dead",
      expiry_at: PAST,
      site: "a.atlassian.net",
      email: "e@x.com",
      api_token: "t",
    };
    refreshMock.mockRejectedValueOnce(new OAuthError("invalid_grant", true));
    const r = (await execute("u1", "jira_echo", {})) as { got: Record<string, string> };
    expect(r.got.api_token).toBe("t");
    expect(r.got.access_token).toBeUndefined();
    expect(memCreds["u1:jira"]!._needsReconnect).toBeUndefined();
    expect(memCreds["u1:jira"]!.access_token).toBeUndefined();
  });
  test("invalid_grant KHÔNG có manual → error + _needsReconnect", async () => {
    memCreds["u1:jira"] = { _connected: "true", access_token: "old", refresh_token: "dead", expiry_at: PAST };
    refreshMock.mockRejectedValueOnce(new OAuthError("invalid_grant", true));
    const r = (await execute("u1", "jira_echo", {})) as { error?: string };
    expect(r.error).toBeTruthy();
    expect(memCreds["u1:jira"]!._needsReconnect).toBe("true");
  });
  test("lỗi transient (5xx) → error nhưng KHÔNG flag needs_reconnect", async () => {
    memCreds["u1:jira"] = { _connected: "true", access_token: "old", refresh_token: "rt", expiry_at: PAST };
    refreshMock.mockRejectedValueOnce(new OAuthError("server_error", false));
    const r = (await execute("u1", "jira_echo", {})) as { error?: string };
    expect(r.error).toBeTruthy();
    expect(memCreds["u1:jira"]!._needsReconnect).toBeUndefined();
  });
  test("no-refresh provider (slack): passthrough dù không expiry_at", async () => {
    memCreds["u1:slack"] = { _connected: "true", access_token: "xoxb" };
    const r = (await execute("u1", "slack_echo", {})) as { got: Record<string, string> };
    expect(r.got.access_token).toBe("xoxb");
  });
  test("REVIEW-FIX: re-read null trong lock (user vừa disconnect) → abort, KHÔNG hồi sinh creds", async () => {
    memCreds["u1:jira"] = { _connected: "true", access_token: "old", refresh_token: "rt", expiry_at: PAST };
    // call 1 = initial read (execute), call 2 = in-lock re-read → row đã bị xoá
    getCreds
      .mockImplementationOnce(async (u: string, id: string) => memCreds[`${u}:${id}`] ?? null)
      .mockImplementationOnce(async () => null);
    const r = (await execute("u1", "jira_echo", {})) as { error?: string };
    expect(r.error).toBeTruthy();
    expect(refreshMock).not.toHaveBeenCalled(); // refresh trên creds cũ = re-INSERT grant đã thu hồi
    expect(setCreds).not.toHaveBeenCalled();
  });
  test("REVIEW-FIX: hết hạn + KHÔNG refresh_token + manual đủ bộ → strip oauth, chạy manual (fast path)", async () => {
    memCreds["u1:jira"] = {
      _connected: "true",
      access_token: "stale",
      expiry_at: PAST,
      site: "a.atlassian.net",
      email: "e@x.com",
      api_token: "t",
    };
    const r = (await execute("u1", "jira_echo", {})) as { got: Record<string, string> };
    expect(r.got.api_token).toBe("t");
    expect(r.got.access_token).toBeUndefined(); // stale Bearer không được thắng manual
    expect(memCreds["u1:jira"]!.access_token).toBeUndefined(); // đã persist bản strip
    expect(refreshMock).not.toHaveBeenCalled();
  });
});

describe("saveOAuthTokens / saveTrelloToken", () => {
  test("merge enrich + expiry; giữ manual fields (oauth thắng khi đọc §12.5b)", async () => {
    memCreds["u1:jira"] = { site: "a.atlassian.net", email: "e@x.com", api_token: "t" };
    enrichMock.mockResolvedValueOnce({ cloud_id: "c9", site_url: "https://a.atlassian.net", _account: "An" });
    await saveOAuthTokens("u1", "jira", "atlassian", {
      access_token: "at",
      refresh_token: "rt",
      expires_in: 3600,
    });
    const saved = memCreds["u1:jira"]!;
    expect(saved.access_token).toBe("at");
    expect(saved.cloud_id).toBe("c9");
    expect(saved._account).toBe("An");
    expect(saved._connected).toBe("true");
    expect(saved.site).toBe("a.atlassian.net"); // manual fields kept
    expect(Date.parse(saved.expiry_at)).toBeGreaterThan(Date.now());
  });
  test("không expires_in (slack) → KHÔNG có expiry_at (token không hết hạn)", async () => {
    await saveOAuthTokens("u1", "slack", "slack", { access_token: "xoxb" });
    expect(memCreds["u1:slack"]!.expiry_at).toBeUndefined();
    expect(memCreds["u1:slack"]!._connected).toBe("true");
  });
  test("saveTrelloToken ghi creds token-mode thường + xoá _needsReconnect", async () => {
    memCreds["u1:trello"] = { key: "old", token: "dead", _needsReconnect: "true" };
    await saveTrelloToken("u1", "fresh-token", "op-key");
    const saved = memCreds["u1:trello"]!;
    expect(saved).toMatchObject({ key: "op-key", token: "fresh-token" });
    expect(saved._needsReconnect).toBeUndefined();
  });
});
