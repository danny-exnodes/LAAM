import { afterEach, expect, test, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { AgentCard } from "./AgentCard";
import type { LiveSession } from "@/hooks/useLiveSessions";

const NOW = 1_700_000_000_000;

function mk(over: Partial<LiveSession> = {}): LiveSession {
  return {
    id: "s1", projectId: "p1", projectName: "LAAM", source: "claude",
    model: "claude-sonnet-4", gitBranch: "main", status: "running",
    startedAt: NOW - 5000, lastActivity: NOW - 1000, messageCount: 4, toolCount: 2,
    subAgentCount: 0, subAgents: null, costUsd: 0.12, latestActivity: "Reading files",
    tokensIn: 100, tokensOut: 50, ...over,
  };
}

function wrap(s: LiveSession, stuck = false) {
  return render(
    <I18nProvider lang="vi">
      <AgentCard s={s} stuck={stuck} />
    </I18nProvider>,
  );
}

afterEach(() => vi.useRealTimers());

test("shows status, model and latest activity", () => {
  wrap(mk());
  expect(screen.getByText("running")).toBeTruthy();
  expect(screen.getByText("Reading files")).toBeTruthy();
});

test("shows the stuck badge only when stuck", () => {
  wrap(mk(), true);
  expect(screen.getByText("Nghi kẹt")).toBeTruthy();
});

test("no stuck badge when not stuck", () => {
  wrap(mk(), false);
  expect(screen.queryByText("Nghi kẹt")).toBeNull();
});

test("shows the LOCAL badge for local sessions", () => {
  wrap(mk({ source: "local" }));
  expect(screen.getByText(/LOCAL/)).toBeTruthy();
});

test("live duration ticker advances each second for running sessions", () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  // started 5s ago, running → initial elapsed reads 0:05
  wrap(mk({ startedAt: NOW - 5000, status: "running" }));
  expect(screen.getByTestId("elapsed").textContent).toBe("0:05");
  act(() => {
    vi.advanceTimersByTime(2000);
  });
  expect(screen.getByTestId("elapsed").textContent).toBe("0:07");
});
