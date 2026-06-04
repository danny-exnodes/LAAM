import { expect, test } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { ModelComparisonTable } from "./ModelComparisonTable";
import type { Stats } from "@/lib/stats.types";

function wrap(modelComparison: Stats["modelComparison"]) {
  return render(
    <I18nProvider lang="vi">
      <ModelComparisonTable modelComparison={modelComparison} />
    </I18nProvider>,
  );
}

const sample: Stats["modelComparison"] = [
  {
    model: "claude-opus-4-20250101",
    sessions: 12,
    tokens: 34000,
    costUsd: 4.2,
    avgDurationMs: 125000,
    tokensPerMin: 980,
    doneRate: 0.5,
  },
  {
    model: "gemma4:e4b",
    sessions: 3,
    tokens: 500,
    costUsd: 0,
    avgDurationMs: 4000,
    tokensPerMin: 120,
    doneRate: 1,
  },
];

test("renders one row per model with formatted cost and done rate", () => {
  wrap(sample);
  const rows = screen.getAllByRole("row");
  // header + 2 data rows
  expect(rows).toHaveLength(3);

  // first data row: shortened model name + cost + done% formatting
  const opus = within(rows[1]);
  expect(opus.getByText("opus-4")).toBeTruthy();
  expect(opus.getByText("$4.20")).toBeTruthy();
  expect(opus.getByText("50%")).toBeTruthy();

  // $0 cost renders as "$0", 100% done
  const gemma = within(rows[2]);
  expect(gemma.getByText("$0")).toBeTruthy();
  expect(gemma.getByText("100%")).toBeTruthy();
});

test("shows the empty state when there are no models", () => {
  wrap([]);
  expect(screen.getByText("Chưa có dữ liệu model để so sánh.")).toBeTruthy();
  expect(screen.queryByRole("table")).toBeNull();
});
