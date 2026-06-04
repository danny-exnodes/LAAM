import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { SlowestTools } from "./SlowestTools";
import type { Stats } from "@/lib/stats.types";

function tool(name: string, avgDurationMs: number | null): Stats["toolLeaderboard"][number] {
  return { name, count: 1, errors: 0, errorRate: 0, avgDurationMs };
}

function wrap(tools: Stats["toolLeaderboard"]) {
  return render(
    <I18nProvider lang="vi">
      <SlowestTools tools={tools} />
    </I18nProvider>,
  );
}

test("sorts timed tools slowest-first and drops the untimed ones", () => {
  wrap([
    tool("Fast", 2000),
    tool("Untimed", null),
    tool("Slow", 90000),
    tool("Mid", 30000),
  ]);
  const items = screen.getAllByRole("listitem");
  // null is dropped; remaining three ordered desc by duration
  expect(items).toHaveLength(3);
  expect(items[0].textContent).toContain("Slow");
  expect(items[1].textContent).toContain("Mid");
  expect(items[2].textContent).toContain("Fast");
  expect(screen.queryByText("Untimed")).toBeNull();
});

test("shows the empty state when no tool has a duration", () => {
  wrap([tool("Untimed", null)]);
  expect(screen.getByText("Chưa có dữ liệu.")).toBeTruthy();
});
