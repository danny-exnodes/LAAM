import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { ModelDoughnut } from "./ModelDoughnut";
import type { Stats } from "@/lib/stats.types";

function wrap(byModel: Stats["byModel"]) {
  return render(
    <I18nProvider lang="vi">
      <ModelDoughnut byModel={byModel} />
    </I18nProvider>,
  );
}

test("renders one legend item per model", () => {
  wrap({ "claude-sonnet-4-20250101": 10, "gemma4:e4b": 4 });
  expect(screen.getAllByTestId("doughnut-legend-item")).toHaveLength(2);
});

test("shortens model names (strips claude- prefix and date suffix)", () => {
  wrap({ "claude-sonnet-4-20250101": 10 });
  // shortModel("claude-sonnet-4-20250101") === "sonnet-4"
  expect(screen.getByText("sonnet-4")).toBeTruthy();
});

test("empty record shows the empty state", () => {
  wrap({});
  expect(screen.getByText("Chưa có dữ liệu.")).toBeTruthy();
});
