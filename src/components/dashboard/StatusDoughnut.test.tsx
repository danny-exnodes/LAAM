import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { StatusDoughnut } from "./StatusDoughnut";
import type { Stats } from "@/lib/stats.types";

function wrap(byStatus: Stats["byStatus"]) {
  return render(
    <I18nProvider lang="vi">
      <StatusDoughnut byStatus={byStatus} />
    </I18nProvider>,
  );
}

test("renders one legend item per non-zero status", () => {
  wrap({ running: 3, idle: 2, done: 50 });
  expect(screen.getAllByTestId("doughnut-legend-item")).toHaveLength(3);
});

test("relabels known statuses via the i18n dict", () => {
  wrap({ running: 1, idle: 0, done: 0 });
  // dash.st.running vi = "Đang chạy"
  expect(screen.getByText("Đang chạy")).toBeTruthy();
});

test("drops zero-valued slices", () => {
  wrap({ running: 0, idle: 0, done: 4 });
  expect(screen.getAllByTestId("doughnut-legend-item")).toHaveLength(1);
});

test("shows the empty state for an empty record", () => {
  wrap({});
  expect(screen.getByText("Chưa có dữ liệu.")).toBeTruthy();
  expect(screen.queryAllByTestId("doughnut-legend-item")).toHaveLength(0);
});
