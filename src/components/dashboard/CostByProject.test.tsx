import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import type { Stats } from "@/lib/stats.types";
import { CostByProject, mapTokensByProject } from "./CostByProject";

const wrap = (ui: React.ReactNode) =>
  render(<I18nProvider lang="vi">{ui}</I18nProvider>);

const row = (
  project: string,
  tokensIn: number,
  tokensOut: number,
): Stats["byProject"][number] => ({
  project,
  sessions: 1,
  tokensIn,
  tokensOut,
  toolCalls: 0,
});

describe("mapTokensByProject (pure)", () => {
  it("returns [] for empty input", () => {
    expect(mapTokensByProject([])).toEqual([]);
  });

  it("computes a total and sorts by total descending", () => {
    const r = mapTokensByProject([
      row("a", 100, 50), // 150
      row("b", 400, 100), // 500
    ]);
    expect(r.map((x) => x.project)).toEqual(["b", "a"]);
    expect(r[0].total).toBe(500);
    expect(r[1].total).toBe(150);
  });

  it("keeps in/out split for stacked bars", () => {
    const r = mapTokensByProject([row("a", 100, 50)]);
    expect(r[0].tokensIn).toBe(100);
    expect(r[0].tokensOut).toBe(50);
  });

  it("limits to topN", () => {
    const rows = Array.from({ length: 20 }, (_, i) => row("p" + i, i, i));
    expect(mapTokensByProject(rows, 5)).toHaveLength(5);
  });
});

describe("CostByProject (render)", () => {
  it("renders its title with data without throwing", () => {
    const { getByText } = wrap(
      <CostByProject byProject={[row("LAAM", 1200, 800)]} />,
    );
    expect(getByText("Tokens theo project (in/out)")).toBeTruthy();
  });

  it("shows an empty state when there is no project data", () => {
    const { getByText } = wrap(<CostByProject byProject={[]} />);
    expect(getByText("Chưa có dữ liệu.")).toBeTruthy();
  });
});
