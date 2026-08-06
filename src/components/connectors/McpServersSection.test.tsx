import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { McpServersSection } from "./McpServersSection";

type McpToolDetail = { name: string; nsName: string; description: string; kind: "read" | "write" };

type McpServer = {
  slug: string;
  name: string;
  url: string;
  hasToken: boolean;
  trustReadHints: boolean;
  tools: string[];
  toolDetails?: McpToolDetail[];
  enabledTools?: string[];
};

function server(over: Partial<McpServer> = {}): McpServer {
  return {
    slug: "my-mcp",
    name: "My MCP",
    url: "https://mcp.example.com/sse",
    hasToken: false,
    trustReadHints: false,
    tools: ["mcp_list", "mcp_search"],
    toolDetails: [
      { name: "mcp_list", nsName: "mcp__my-mcp__mcp_list", description: "d", kind: "read" },
      { name: "mcp_search", nsName: "mcp__my-mcp__mcp_search", description: "d", kind: "read" },
    ],
    enabledTools: ["mcp_list", "mcp_search"],
    ...over,
  };
}

// fetch mock routed by `${method} ${url}`. Returns ok JSON by default.
function mockFetch(routes: Record<string, unknown> = {}) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const key = `${method} ${url}`;
    // strip query string so "DELETE /api/connectors/mcp" matches with ?slug=…
    const noQuery = `${method} ${url.split("?")[0]}`;
    const body = routes[key] ?? routes[noQuery] ?? routes[url] ?? { ok: true };
    return {
      ok: (body as { _ok?: boolean })._ok !== false,
      json: async () => body,
    } as Response;
  });
}

function wrap() {
  return render(
    <I18nProvider lang="vi">
      <McpServersSection />
    </I18nProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

test("renders servers from GET including tool names and trust badge", async () => {
  const fetchMock = mockFetch({
    "GET /api/connectors/mcp": {
      servers: [server({ trustReadHints: true })],
    },
  });
  vi.stubGlobal("fetch", fetchMock);

  wrap();

  expect(await screen.findByText("My MCP")).toBeTruthy();
  // URL host, not the full URL
  expect(screen.getByText("mcp.example.com")).toBeTruthy();
  // The card summarises how many tools are on; the names live behind "Chọn công cụ".
  expect(screen.getByText("2/2 công cụ đang bật")).toBeTruthy();
  fireEvent.click(screen.getByText("Chọn công cụ"));
  expect(screen.getByText(/mcp_list/)).toBeTruthy();
  expect(screen.getByText(/mcp_search/)).toBeTruthy();
  // trust-reads badge (vi label) appears — card badge + form checkbox both use it,
  // so there is more than one; assert at least one is present.
  expect(screen.getAllByText("Tin tưởng gợi ý chỉ-đọc").length).toBeGreaterThanOrEqual(1);
});

test("shows 'none yet' when the list is empty", async () => {
  const fetchMock = mockFetch({ "GET /api/connectors/mcp": { servers: [] } });
  vi.stubGlobal("fetch", fetchMock);

  wrap();

  expect(await screen.findByText("Chưa có máy chủ MCP nào.")).toBeTruthy();
});

test("add submits POST with the field values then reloads", async () => {
  const fetchMock = mockFetch({
    "GET /api/connectors/mcp": { servers: [] },
    "POST /api/connectors/mcp": { ok: true, slug: "added" },
  });
  vi.stubGlobal("fetch", fetchMock);

  wrap();
  await screen.findByText("Chưa có máy chủ MCP nào.");

  fireEvent.change(screen.getByLabelText("Tên"), { target: { value: "Acme MCP" } });
  fireEvent.change(screen.getByLabelText("URL"), { target: { value: "https://acme.example/sse" } });
  fireEvent.change(screen.getByLabelText("Token xác thực (tuỳ chọn)"), {
    target: { value: "secret-tok" },
  });
  // the only checkbox on screen is the trust-read-hints toggle
  fireEvent.click(screen.getByRole("checkbox"));

  // "Thêm máy chủ MCP" is the submit button label (also the section CTA text).
  fireEvent.click(screen.getByRole("button", { name: "Thêm máy chủ MCP" }));

  await waitFor(() => {
    const postCall = fetchMock.mock.calls.find(
      (c) => c[0] === "/api/connectors/mcp" && (c[1] as RequestInit)?.method === "POST",
    );
    expect(postCall).toBeTruthy();
    const sent = JSON.parse((postCall?.[1] as RequestInit)?.body as string);
    expect(sent.name).toBe("Acme MCP");
    expect(sent.url).toBe("https://acme.example/sse");
    expect(sent.authToken).toBe("secret-tok");
    expect(sent.trustReadHints).toBe(true);
  });

  // reloaded: GET called again after the POST (initial mount + post-submit reload)
  await waitFor(() => {
    const gets = fetchMock.mock.calls.filter(
      (c) => c[0] === "/api/connectors/mcp" && ((c[1] as RequestInit)?.method ?? "GET") === "GET",
    );
    expect(gets.length).toBeGreaterThanOrEqual(2);
  });
});

test("remove calls DELETE with the slug", async () => {
  const fetchMock = mockFetch({
    "GET /api/connectors/mcp": { servers: [server({ slug: "to-remove" })] },
    "DELETE /api/connectors/mcp": { ok: true },
  });
  vi.stubGlobal("fetch", fetchMock);

  wrap();
  await screen.findByText("My MCP");

  fireEvent.click(screen.getByRole("button", { name: "Gỡ" }));

  await waitFor(() => {
    const del = fetchMock.mock.calls.find(
      (c) => (c[1] as RequestInit)?.method === "DELETE",
    );
    expect(del).toBeTruthy();
    expect(String(del?.[0])).toContain("slug=to-remove");
  });
});

// WHY (Rule 9): every enabled tool is re-sent to the model on EVERY round, so switching one
// off has to actually stop it being sent — the checkbox must reach the server, not just the UI.
test("turning a tool off PATCHes the remaining list", async () => {
  const fetchMock = mockFetch({
    "GET /api/connectors/mcp": { servers: [server()] },
    "PATCH /api/connectors/mcp": { ok: true },
  });
  vi.stubGlobal("fetch", fetchMock);

  wrap();
  await screen.findByText("My MCP");
  fireEvent.click(screen.getByText("Chọn công cụ"));
  fireEvent.click(screen.getByRole("checkbox", { name: /mcp_search/ }));
  fireEvent.click(screen.getByRole("button", { name: "Lưu" }));

  await waitFor(() => {
    const call = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === "PATCH");
    expect(call).toBeTruthy();
    expect(JSON.parse(String((call![1] as RequestInit).body))).toEqual({
      slug: "my-mcp",
      enabledTools: ["mcp_list"],
    });
  });
});

// Ticking everything stores `null`, not a frozen snapshot: a tool the server gains later
// should then be ON by default, which is what "all" means to whoever ticked every box.
test("enabling every tool PATCHes null rather than the full list", async () => {
  const fetchMock = mockFetch({
    "GET /api/connectors/mcp": { servers: [server({ enabledTools: ["mcp_list"] })] },
    "PATCH /api/connectors/mcp": { ok: true },
  });
  vi.stubGlobal("fetch", fetchMock);

  wrap();
  await screen.findByText("My MCP");
  fireEvent.click(screen.getByText("Chọn công cụ"));
  fireEvent.click(screen.getByText("Bật tất cả"));
  fireEvent.click(screen.getByRole("button", { name: "Lưu" }));

  await waitFor(() => {
    const call = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === "PATCH");
    expect(JSON.parse(String((call![1] as RequestInit).body))).toEqual({
      slug: "my-mcp",
      enabledTools: null,
    });
  });
});

// A response from before this feature (no toolDetails) must degrade to "no picker" instead of
// crashing the card — a thrown render here would take the whole server list down.
test("a server payload without toolDetails still renders", async () => {
  const fetchMock = mockFetch({
    "GET /api/connectors/mcp": {
      servers: [{ slug: "old", name: "Old MCP", url: "https://old.example/sse", hasToken: false, trustReadHints: false, tools: [] }],
    },
  });
  vi.stubGlobal("fetch", fetchMock);

  wrap();
  expect(await screen.findByText("Old MCP")).toBeTruthy();
});
