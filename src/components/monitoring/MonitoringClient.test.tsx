import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import type { LiveSession } from "@/hooks/useLiveSessions";

// MonitoringClient is the unified home: an "Agents" tab (default) that mounts the
// rich live AgentsClient, plus "Chat" and "Workflow" read-model tables. The Agents
// tab uses SSE (useLiveSessions); the Chat/Workflow tabs fetch /api/monitoring.
// We mock the live hook (AgentsClient's SSE source) so this test is deterministic.

const NOW = 1_700_000_000_000;
function mkSession(over: Partial<LiveSession> = {}): LiveSession {
  return {
    id: "s1", projectId: "p1", projectName: "LAAM", source: "claude",
    model: "m1", gitBranch: "main", status: "running",
    startedAt: NOW - 5000, lastActivity: NOW - 1000, messageCount: 1, toolCount: 1,
    subAgentCount: 0, subAgents: null, costUsd: 0, latestActivity: "alpha",
    tokensIn: 0, tokensOut: 0, ...over,
  };
}

const hookState = { sessions: [] as LiveSession[], connected: true, stuckIds: [] as string[], stuckMin: 10 };
vi.mock("@/hooks/useLiveSessions", () => ({
  useLiveSessions: () => hookState,
}));
vi.mock("@/lib/export", () => ({ downloadCsv: vi.fn() }));
// The header SyncButton uses next/navigation router.refresh — not under test here,
// but MonitoringClient renders its OWN sync action, so stub the router.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import { MonitoringClient } from "./MonitoringClient";

type Run = {
  id: string;
  source: string;
  title: string;
  status: string | null;
  lastActivity: string | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  workflowId?: string | null;
};

function mockMonitoringFetch(runs: Run[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/monitoring")) {
        return { ok: true, json: async () => ({ runs }) };
      }
      // /api/machines (AgentsClient) etc.
      return { ok: true, json: async () => ({ machines: [] }) };
    }),
  );
}

function ui(initialTab?: string) {
  return render(
    <I18nProvider lang="vi">
      <MonitoringClient initialTab={initialTab} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  hookState.sessions = [];
  mockMonitoringFetch([]);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

test("renders exactly three tabs: Agents, Chat, Workflow", () => {
  ui();
  expect(screen.getByRole("tab", { name: /Agents/i })).toBeTruthy();
  expect(screen.getByRole("tab", { name: /Chat/i })).toBeTruthy();
  expect(screen.getByRole("tab", { name: /Workflow/i })).toBeTruthy();
  // The old "All" / "External (API/MCP)" tabs are GONE — Agents subsumes them.
  expect(screen.queryByRole("tab", { name: /^Tất cả$/ })).toBeNull();
});

test("Agents tab is the default and mounts the live AgentsClient (renders session cards)", () => {
  hookState.sessions = [mkSession({ id: "a", latestActivity: "alpha-task" })];
  ui();
  // AgentsClient renders the session's latestActivity inside a card.
  expect(screen.getByText("alpha-task")).toBeTruthy();
});

test("Chat tab renders the read-model table with a click-through to /chat", async () => {
  mockMonitoringFetch([
    { id: "c1", source: "chat", title: "Hỏi deploy", status: null, lastActivity: null, tokensIn: 0, tokensOut: 0, costUsd: 0 },
  ]);
  ui();
  fireEvent.click(screen.getByRole("tab", { name: /Chat/i }));
  const link = await screen.findByRole("link", { name: /Hỏi deploy/ });
  expect(link.getAttribute("href")).toBe("/chat");
});

test("Workflow tab links to /workflows/<workflowId>?run=<runId>", async () => {
  mockMonitoringFetch([
    {
      id: "run-9", source: "workflow", title: "Daily digest", status: "succeeded",
      lastActivity: null, tokensIn: 0, tokensOut: 0, costUsd: 0, workflowId: "wf-1",
    },
  ]);
  ui();
  fireEvent.click(screen.getByRole("tab", { name: /Workflow/i }));
  const link = await screen.findByRole("link", { name: /Daily digest/ });
  expect(link.getAttribute("href")).toBe("/workflows/wf-1?run=run-9");
});

test("Chat tab requests source=chat (per-source visibility stays at the read-model)", async () => {
  const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/monitoring")) return { ok: true, json: async () => ({ runs: [] }) };
    return { ok: true, json: async () => ({ machines: [] }) };
  });
  vi.stubGlobal("fetch", fetchSpy);
  ui();
  fireEvent.click(screen.getByRole("tab", { name: /Chat/i }));
  await waitFor(() =>
    expect(
      fetchSpy.mock.calls.some(([u]) => String(u).includes("/api/monitoring") && String(u).includes("source=chat")),
    ).toBe(true),
  );
});

test("initialTab=chat opens the Chat tab directly (deep-link from /monitoring?tab=chat)", async () => {
  mockMonitoringFetch([
    { id: "c1", source: "chat", title: "deep-linked convo", status: null, lastActivity: null, tokensIn: 0, tokensOut: 0, costUsd: 0 },
  ]);
  ui("chat");
  expect(await screen.findByRole("link", { name: /deep-linked convo/ })).toBeTruthy();
});

test("shows a last-synced freshness indicator (UI-live vs data-fresh) + its own Sync button", () => {
  ui();
  // The freshness line is always present so users never assume data auto-refreshes.
  expect(screen.getByTestId("monitoring-freshness")).toBeTruthy();
  expect(screen.getByRole("button", { name: /đồng bộ/i })).toBeTruthy();
});
