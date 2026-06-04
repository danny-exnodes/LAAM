import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { ToolLeaderboard } from "./ToolLeaderboard";
import type { Stats } from "@/lib/stats.types";

function tool(name: string, count: number): Stats["toolLeaderboard"][number] {
  return { name, count, errors: 0, errorRate: 0, avgDurationMs: null };
}

function wrap(tools: Stats["toolLeaderboard"]) {
  return render(
    <I18nProvider lang="vi">
      <ToolLeaderboard tools={tools} />
    </I18nProvider>,
  );
}

test("caps the leaderboard at 12 bars even with more tools", () => {
  const tools = Array.from({ length: 20 }, (_, i) => tool(`Tool${i}`, i + 1));
  const { container } = wrap(tools);
  expect(container.querySelectorAll("[data-tool-bar]")).toHaveLength(12);
});

test("sorts by call count descending so the busiest tool is first", () => {
  wrap([tool("Read", 5), tool("Bash", 40), tool("Edit", 12)]);
  const items = screen.getAllByRole("listitem");
  expect(items[0].textContent).toContain("Bash");
  expect(items[1].textContent).toContain("Edit");
  expect(items[2].textContent).toContain("Read");
});

test("shows the empty state with no tools", () => {
  wrap([]);
  expect(screen.getByText("Chưa có dữ liệu.")).toBeTruthy();
});
