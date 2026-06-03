import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { BranchDoughnut } from "./BranchDoughnut";
import type { Stats } from "@/lib/stats.types";

function wrap(byBranch: Stats["byBranch"]) {
  return render(
    <I18nProvider lang="vi">
      <BranchDoughnut byBranch={byBranch} />
    </I18nProvider>,
  );
}

test("renders one legend item per branch with the raw branch name", () => {
  wrap({ main: 40, "feat/v2-foundation": 12 });
  expect(screen.getAllByTestId("doughnut-legend-item")).toHaveLength(2);
  expect(screen.getByText("feat/v2-foundation")).toBeTruthy();
});

test("shows the branch chart title", () => {
  wrap({ main: 1 });
  // dash.chart.branch vi = "Phân bố theo branch"
  expect(screen.getByText("Phân bố theo branch")).toBeTruthy();
});

test("empty record shows the empty state", () => {
  wrap({});
  expect(screen.getByText("Chưa có dữ liệu.")).toBeTruthy();
});
