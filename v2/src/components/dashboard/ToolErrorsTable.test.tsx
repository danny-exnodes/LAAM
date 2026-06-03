import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { ToolErrorsTable } from "./ToolErrorsTable";
import type { Stats } from "@/lib/stats.types";

function tool(
  name: string,
  count: number,
  errors: number,
  errorRate: number,
): Stats["toolLeaderboard"][number] {
  return { name, count, errors, errorRate, avgDurationMs: null };
}

function wrap(tools: Stats["toolLeaderboard"]) {
  return render(
    <I18nProvider lang="vi">
      <ToolErrorsTable tools={tools} />
    </I18nProvider>,
  );
}

test("only lists tools with errors, sorted by error rate descending", () => {
  wrap([
    tool("Read", 100, 0, 0), // no errors → excluded
    tool("Bash", 50, 5, 0.1),
    tool("Edit", 20, 8, 0.4),
  ]);
  const rows = screen.getAllByRole("row").slice(1); // drop header
  expect(rows).toHaveLength(2);
  expect(rows[0].textContent).toContain("Edit"); // 40% first
  expect(rows[1].textContent).toContain("Bash"); // 10% second
  expect(screen.queryByText("Read")).toBeNull();
});

test("shows the no-errors message when nothing has errored", () => {
  wrap([tool("Read", 100, 0, 0)]);
  expect(screen.getByText("Không có lỗi tool nào 🎉")).toBeTruthy();
  expect(screen.queryByRole("table")).toBeNull();
});
