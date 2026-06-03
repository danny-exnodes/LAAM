import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { KpiGrid } from "./KpiGrid";
import type { Stats } from "@/lib/stats.types";

function wrap(totals: Stats["totals"]) {
  return render(
    <I18nProvider lang="vi">
      <KpiGrid totals={totals} />
    </I18nProvider>,
  );
}

function mk(over: Partial<Stats["totals"]> = {}): Stats["totals"] {
  return {
    sessions: 60,
    running: 3,
    idle: 5,
    done: 52,
    messages: 1240,
    toolCalls: 880,
    subAgents: 7,
    tokensIn: 1_500_000,
    tokensOut: 320_000,
    costUsd: 123.89,
    avgDurationMs: 9 * 60_000 + 30_000, // 9m30s
    ...over,
  };
}

test("renders a labeled card for every total", () => {
  wrap(mk());
  // vi labels from the dashboard dict
  expect(screen.getByText("Session")).toBeTruthy();
  expect(screen.getByText("Đang chạy")).toBeTruthy();
  expect(screen.getByText("Messages")).toBeTruthy();
  expect(screen.getByText("Tool calls")).toBeTruthy();
});

test("formats cost with usd() and tokens with num()", () => {
  wrap(mk({ costUsd: 123.89, tokensIn: 1_500_000 }));
  expect(screen.getByText("$123.89")).toBeTruthy();
  // num(1_500_000) === "1500k"
  expect(screen.getByText("1500k")).toBeTruthy();
});

test("formats avg duration as human-readable", () => {
  wrap(mk({ avgDurationMs: 9 * 60_000 + 30_000 }));
  // Why: a raw ms count (570000) is meaningless on a dashboard KPI; the user
  // needs minutes/seconds. 9m30s must render as "9m 30s", not "570000".
  expect(screen.getByText("9m 30s")).toBeTruthy();
  expect(screen.queryByText("570000")).toBeNull();
});

test("zero cost renders $0 (not blank)", () => {
  wrap(mk({ costUsd: 0 }));
  expect(screen.getByText("$0")).toBeTruthy();
});
