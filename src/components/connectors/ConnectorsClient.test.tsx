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
    "/api/connectors": { connectors: [item(), item({ id: "demo", name: "Demo", blurb: "Sample tasks", auth: { type: "none", provider: "", scopes: [], help: "No auth", setup: "", fields: [] }, tools: [{ name: "demo_list_tasks", description: "", parameters: {} }] })] },
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
