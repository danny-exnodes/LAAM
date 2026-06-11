import { afterEach, expect, test, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import type { LiveSession } from "@/hooks/useLiveSessions";

const NOW = 1_700_000_000_000;
function mk(over: Partial<LiveSession> = {}): LiveSession {
  return {
    id: "s1", projectId: "p1", projectName: "LAAM", source: "claude",
    model: "m1", gitBranch: "main", status: "running",
    startedAt: NOW - 5000, lastActivity: NOW - 1000, messageCount: 1, toolCount: 1,
    subAgentCount: 0, subAgents: null, costUsd: 0, latestActivity: "alpha",
    tokensIn: 0, tokensOut: 0, ...over,
  };
}

// Mutable state for the mocked hook.
const hookState = { sessions: [] as LiveSession[], connected: true, stuckIds: [] as string[] };
vi.mock("@/hooks/useLiveSessions", () => ({
  useLiveSessions: () => hookState,
}));
const downloadCsv = vi.fn();
vi.mock("@/lib/export", () => ({ downloadCsv: (...a: unknown[]) => downloadCsv(...a) }));

import { AgentsClient } from "./AgentsClient";

function ui() {
  return render(
    <I18nProvider lang="vi">
      <AgentsClient />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  downloadCsv.mockClear();
  vi.unstubAllGlobals();
});

test("renders a card per session and the X/Y count", () => {
  hookState.sessions = [mk({ id: "a", latestActivity: "alpha" }), mk({ id: "b", latestActivity: "beta" })];
  ui();
  expect(screen.getByText("alpha")).toBeTruthy();
  expect(screen.getByText("beta")).toBeTruthy();
  expect(screen.getByText("2/2 session")).toBeTruthy();
});

test("typing in search narrows the visible cards live", () => {
  hookState.sessions = [mk({ id: "a", latestActivity: "alpha" }), mk({ id: "b", latestActivity: "beta" })];
  ui();
  fireEvent.change(screen.getByPlaceholderText("Tìm project / agent / task…"), {
    target: { value: "alpha" },
  });
  expect(screen.getByText("alpha")).toBeTruthy();
  expect(screen.queryByText("beta")).toBeNull();
  expect(screen.getByText("1/2 session")).toBeTruthy();
});

test("groups by projectName, null → Khác", () => {
  hookState.sessions = [mk({ id: "a", projectName: "LAAM" }), mk({ id: "b", projectName: null, latestActivity: "orphan" })];
  ui();
  // Assert on the group section headings (h2), not the FilterBar <option>s.
  expect(screen.getByRole("heading", { level: 2, name: /^LAAM/ })).toBeTruthy();
  expect(screen.getByRole("heading", { level: 2, name: /^Khác/ })).toBeTruthy();
});

test("the no-project group label is localized — en users see 'Other', never the vi text or the sentinel", () => {
  hookState.sessions = [mk({ id: "b", projectName: null, latestActivity: "orphan" })];
  render(
    <I18nProvider lang="en">
      <AgentsClient />
    </I18nProvider>,
  );
  expect(screen.getByRole("heading", { level: 2, name: /^Other/ })).toBeTruthy();
  expect(screen.queryByText(/Khác/)).toBeNull();
  expect(screen.queryByText(/__other__/)).toBeNull(); // grouping sentinel must not leak to the DOM
});

test("machine dropdown lists /api/machines and narrows cards to that machine's sessions", async () => {
  // Multi-machine ingest mixes every box's agents into one list; the machine
  // filter is how a dev isolates their own machine (v1-unported gap, W6).
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        machines: [
          { id: "m:abc", name: "An's box", hostname: null, hasToken: true },
          { id: "local:dev", name: null, hostname: "devhost", hasToken: false },
        ],
      }),
    })),
  );
  hookState.sessions = [
    mk({ id: "a", machineId: "m:abc", latestActivity: "alpha" }),
    mk({ id: "b", machineId: "local:dev", latestActivity: "beta" }),
  ];
  ui();

  // Options come from /api/machines (async); name falls back to hostname.
  expect(await screen.findByRole("option", { name: "An's box" })).toBeTruthy();
  expect(screen.getByRole("option", { name: "devhost" })).toBeTruthy();

  fireEvent.change(screen.getByLabelText("machine-filter"), { target: { value: "m:abc" } });
  expect(screen.getByText("alpha")).toBeTruthy();
  expect(screen.queryByText("beta")).toBeNull();
  expect(screen.getByText("1/2 session")).toBeTruthy();
});

test("CSV button exports the filtered rows via downloadCsv", () => {
  hookState.sessions = [mk({ id: "a", latestActivity: "alpha" }), mk({ id: "b", latestActivity: "beta" })];
  ui();
  fireEvent.change(screen.getByPlaceholderText("Tìm project / agent / task…"), {
    target: { value: "alpha" },
  });
  fireEvent.click(screen.getByText("CSV"));
  expect(downloadCsv).toHaveBeenCalledTimes(1);
  const [filename, rows, columns] = downloadCsv.mock.calls[0];
  expect(filename).toBe("agents.csv");
  expect(rows).toHaveLength(1); // only the filtered "alpha" row
  expect(rows[0].id).toBe("a");
  expect(columns[0]).toBe("id");
});
