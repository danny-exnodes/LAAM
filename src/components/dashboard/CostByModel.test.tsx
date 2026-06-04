import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import type { Stats } from "@/lib/stats.types";
import { CostByModel, mapCostByModel } from "./CostByModel";

const wrap = (ui: React.ReactNode) =>
  render(<I18nProvider lang="vi">{ui}</I18nProvider>);

const row = (model: string, costUsd: number): Stats["modelComparison"][number] => ({
  model,
  sessions: 1,
  tokens: 100,
  costUsd,
  avgDurationMs: 1000,
  tokensPerMin: 50,
  doneRate: 1,
});

describe("mapCostByModel (pure)", () => {
  it("returns [] for empty input", () => {
    expect(mapCostByModel([])).toEqual([]);
  });

  it("sorts by cost descending and shortens model names", () => {
    const r = mapCostByModel([
      row("claude-opus-4-8-20260101", 1),
      row("claude-haiku-4-5", 5),
    ]);
    expect(r.map((x) => x.costUsd)).toEqual([5, 1]);
    expect(r[0].model).toBe("haiku-4-5");
    expect(r[1].model).toBe("opus-4-8");
  });

  it("limits to topN", () => {
    const rows = Array.from({ length: 20 }, (_, i) => row("m" + i, i));
    expect(mapCostByModel(rows, 5)).toHaveLength(5);
  });
});

describe("CostByModel (render)", () => {
  it("renders its title with data without throwing", () => {
    const { getByText } = wrap(
      <CostByModel modelComparison={[row("claude-opus-4-8", 3.5)]} />,
    );
    expect(getByText("Chi phí ước tính theo model (USD)")).toBeTruthy();
  });

  it("shows an empty state when there is no model data", () => {
    const { getByText } = wrap(<CostByModel modelComparison={[]} />);
    expect(getByText("Chưa có dữ liệu.")).toBeTruthy();
  });
});
