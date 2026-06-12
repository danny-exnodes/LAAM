import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { render, screen, waitFor, within, act } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { ConnectorsClient } from "./ConnectorsClient";
import type { ConnectorListItem } from "@/lib/connectors/types";

function item(over: Partial<ConnectorListItem> = {}): ConnectorListItem {
  const { auth: authOver, ...rest } = over;
  const connected = rest.connected ?? false;
  return {
    id: "github",
    name: "GitHub",
    icon: "github",
    blurb: "Repos, issues, PRs",
    tools: [
      { name: "github_list_repos", description: "", parameters: {} },
      { name: "github_search", description: "", parameters: {} },
    ],
    account: null,
    connectedAt: null,
    ...rest,
    connected,
    status: rest.status ?? (connected ? "connected" : "disconnected"),
    auth: {
      type: "token",
      provider: "",
      scopes: [],
      help: "Paste a PAT",
      setup: "",
      oauthConfigured: false,
      fields: [{ key: "token", label: "Token", placeholder: "ghp_…", secret: true, set: false, masked: "" }],
      ...authOver,
    },
  };
}

// A fetch mock that routes by URL. Returns ok JSON by default.
function mockFetch(routes: Record<string, unknown> = {}) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url}`;
    const body = routes[key] ?? routes[url] ?? { ok: true };
    return {
      ok: (body as { _ok?: boolean })._ok !== false,
      json: async () => body,
    } as Response;
  });
}

function wrap() {
  return render(
    <I18nProvider lang="vi">
      <ConnectorsClient />
    </I18nProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

test("renders connectors from the list endpoint", async () => {
  const fetchMock = mockFetch({
    "/api/connectors": { connectors: [item(), item({ id: "demo", name: "Demo", blurb: "Sample tasks", auth: { type: "none", provider: "", scopes: [], help: "No auth", setup: "", oauthConfigured: false, fields: [] }, tools: [{ name: "demo_list_tasks", description: "", parameters: {} }] })] },
  });
  vi.stubGlobal("fetch", fetchMock);

  wrap();

  expect(await screen.findByText("GitHub")).toBeTruthy();
  expect(screen.getByText("Demo")).toBeTruthy();
  // blurb is now i18n'd by connector id: github resolves conn.svc.github.blurb (vi).
  expect(screen.getByText("Repos, issues, pull requests")).toBeTruthy();
  // tool names rendered
  expect(screen.getByText(/github_list_repos/)).toBeTruthy();
  // not-connected badge (vi)
  expect(screen.getAllByText("Chưa kết nối").length).toBe(2);
});

test("shows load error when the list endpoint fails", async () => {
  const fetchMock = vi.fn(async () => {
    throw new Error("network");
  });
  vi.stubGlobal("fetch", fetchMock);

  wrap();

  expect(await screen.findByText("Không tải được danh sách kết nối.")).toBeTruthy();
});

test("connect submits the field values then tests", async () => {
  const fetchMock = mockFetch({
    "/api/connectors": { connectors: [item()] },
    "POST /api/connectors/github/connect": { ok: true },
    "POST /api/connectors/github/test": { ok: true, info: "Hi octocat" },
  });
  vi.stubGlobal("fetch", fetchMock);

  wrap();
  await screen.findByText("GitHub");

  const input = screen.getByPlaceholderText("ghp_…") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "ghp_secret123" } });
  fireEvent.click(screen.getByRole("button", { name: "Kết nối" }));

  await waitFor(() => {
    const connectCall = fetchMock.mock.calls.find(
      (c) => c[0] === "/api/connectors/github/connect",
    );
    expect(connectCall).toBeTruthy();
    expect(connectCall?.[1]?.method).toBe("POST");
    const sent = JSON.parse(connectCall?.[1]?.body as string);
    expect(sent.fields.token).toBe("ghp_secret123");
  });
});

test("test button calls the test endpoint and shows info inline", async () => {
  const fetchMock = mockFetch({
    "/api/connectors": { connectors: [item({ connected: true, connectedAt: "2026-06-03T00:00:00Z" })] },
    "POST /api/connectors/github/test": { ok: true, info: "Logged in as octocat" },
  });
  vi.stubGlobal("fetch", fetchMock);

  wrap();
  await screen.findByText("GitHub");

  fireEvent.click(screen.getByRole("button", { name: "Kiểm tra" }));

  expect(await screen.findByText("Logged in as octocat")).toBeTruthy();
  const testCall = fetchMock.mock.calls.find((c) => c[0] === "/api/connectors/github/test");
  expect(testCall?.[1]?.method).toBe("POST");
});

test("disconnect calls the disconnect endpoint and reloads", async () => {
  const fetchMock = mockFetch({
    "/api/connectors": { connectors: [item({ connected: true, connectedAt: "2026-06-03T00:00:00Z" })] },
    "POST /api/connectors/github/disconnect": { ok: true },
  });
  vi.stubGlobal("fetch", fetchMock);

  wrap();
  await screen.findByText("GitHub");

  fireEvent.click(screen.getByRole("button", { name: "Ngắt" }));

  await waitFor(() => {
    const call = fetchMock.mock.calls.find((c) => c[0] === "/api/connectors/github/disconnect");
    expect(call).toBeTruthy();
    expect(call?.[1]?.method).toBe("POST");
  });
});

test("oauth đã cấu hình: nút authorize per-provider + expander nhập tay (dual-mode jira)", async () => {
  const jira = item({
    id: "jira",
    name: "Jira",
    auth: {
      type: "oauth",
      provider: "atlassian",
      scopes: ["read:jira-work"],
      help: "manual help",
      setup: "operator setup",
      oauthConfigured: true,
      fields: [{ key: "api_token", label: "API Token", placeholder: "ATATT…", secret: true, set: false, masked: "" }],
    },
  });
  vi.stubGlobal("fetch", mockFetch({ "/api/connectors": { connectors: [jira] } }));

  wrap();
  await screen.findByText("Jira");

  // Authorize anchor with the per-provider label (NOT the old Google-only label)
  const a = screen.getByRole("link", { name: "Kết nối với Jira" }) as HTMLAnchorElement;
  expect(a.getAttribute("href")).toBe("/api/connectors/jira/authorize");
  // Manual fallback lives behind the expander
  expect(screen.getByText("Hoặc nhập token thủ công")).toBeTruthy();
});

test("oauth CHƯA cấu hình: không có nút authorize, hiện setup-hint + fields nhập tay (fallback)", async () => {
  // id "acme" cố ý KHÔNG có key conn.svc.* trong dict → svc() fallback đúng
  // chuỗi connector cung cấp (jira thật sẽ bị dict override — đã có test riêng).
  const acme = item({
    id: "acme",
    name: "Acme",
    auth: {
      type: "oauth",
      provider: "atlassian",
      scopes: [],
      help: "manual help",
      setup: "operator setup hint",
      oauthConfigured: false,
      fields: [{ key: "api_token", label: "API Token", placeholder: "ATATT…", secret: true, set: false, masked: "" }],
    },
  });
  vi.stubGlobal("fetch", mockFetch({ "/api/connectors": { connectors: [acme] } }));

  wrap();
  await screen.findByText("Acme");

  expect(screen.queryByRole("link", { name: /Kết nối với/ })).toBeNull();
  expect(screen.getByText("operator setup hint")).toBeTruthy();
  expect(screen.getByPlaceholderText("ATATT…")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Kết nối" })).toBeTruthy();
});

test("trello (token + accelerator): có CẢ nút authorize lẫn fields nhập tay", async () => {
  const trello = item({
    id: "trello",
    name: "Trello",
    auth: {
      type: "token",
      provider: "",
      scopes: [],
      help: "trello help",
      setup: "",
      oauthConfigured: true,
      fields: [{ key: "key", label: "API Key", placeholder: "key…", secret: true, set: false, masked: "" }],
    },
  });
  vi.stubGlobal("fetch", mockFetch({ "/api/connectors": { connectors: [trello] } }));

  wrap();
  await screen.findByText("Trello");

  const a = screen.getByRole("link", { name: "Kết nối với Trello" }) as HTMLAnchorElement;
  expect(a.getAttribute("href")).toBe("/api/connectors/trello/authorize");
  expect(screen.getByPlaceholderText("key…")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Kết nối" })).toBeTruthy();
});

test("test failure shows the error message inline", async () => {
  const fetchMock = mockFetch({
    "/api/connectors": { connectors: [item({ connected: true })] },
    "POST /api/connectors/github/test": { _ok: false, error: "Bad token" },
  });
  vi.stubGlobal("fetch", fetchMock);

  wrap();
  await screen.findByText("GitHub");

  fireEvent.click(screen.getByRole("button", { name: "Kiểm tra" }));

  expect(await screen.findByText("Bad token")).toBeTruthy();
});
