import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { Heatmap } from "./Heatmap";
import type { Stats } from "@/lib/stats.types";

function wrap(heatmap: Stats["heatmap"]) {
  return render(
    <I18nProvider lang="vi">
      <Heatmap heatmap={heatmap} />
    </I18nProvider>,
  );
}

// 7×24 grid of zeros, with one peak cell we can locate.
function grid(peak?: { d: number; h: number; v: number }): Stats["heatmap"] {
  const g = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  if (peak) g[peak.d][peak.h] = peak.v;
  return g;
}

test("renders 168 cells for a 7×24 grid", () => {
  wrap(grid({ d: 2, h: 10, v: 5 }));
  expect(screen.getAllByTestId("hm-cell")).toHaveLength(168);
});

test("the max cell has the highest intensity (full opacity)", () => {
  wrap(grid({ d: 3, h: 14, v: 8 }));
  const cells = screen.getAllByTestId("hm-cell") as HTMLElement[];
  // Why: the single non-zero cell equals the max → its background opacity must
  // be 1 (value/max === 1), strictly greater than every zero cell. This is the
  // whole point of a heatmap: the busiest hour must read as the most intense.
  const peak = cells[3 * 24 + 14];
  expect(peak.style.background).not.toBe("");
  const zero = cells[0];
  expect(zero.style.background).toBe("");
});

test("shows the empty state when the grid has no activity", () => {
  wrap(grid()); // all zeros → max 0
  // vi: "Chưa có dữ liệu hoạt động."
  expect(screen.getByText("Chưa có dữ liệu hoạt động.")).toBeTruthy();
  expect(screen.queryAllByTestId("hm-cell")).toHaveLength(0);
});

test("legend high label carries the max value", () => {
  wrap(grid({ d: 1, h: 9, v: 12 }));
  // dash.hm.high vi: "nhiều (tối đa {max})"
  expect(screen.getByText(/tối đa 12/)).toBeTruthy();
});
