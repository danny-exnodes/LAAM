import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { TopSessions } from "./TopSessions";
import type { Stats } from "@/lib/stats.types";

function wrap(byDuration: Stats["topByDuration"], byTokens: Stats["topByTokens"]) {
  return render(
    <I18nProvider lang="vi">
      <TopSessions byDuration={byDuration} byTokens={byTokens} />
    </I18nProvider>,
  );
}

test("renders both lists with labels and formatted values", () => {
  wrap(
    [
      { id: "a", label: "proj-a · abc123", durationMs: 3600000 }, // 1h 0m
      { id: "b", label: "proj-b · def456", durationMs: 90000 }, // 1m 30s
    ],
    [{ id: "c", label: "proj-c · ghi789", tokens: 42000 }],
  );

  // both section titles present
  expect(screen.getByText("Top session theo thời lượng")).toBeTruthy();
  expect(screen.getByText("Top session theo tokens")).toBeTruthy();

  // duration list: labels + fmtDur formatting
  expect(screen.getByText("proj-a · abc123")).toBeTruthy();
  expect(screen.getByText("1h 0m")).toBeTruthy();
  expect(screen.getByText("1m 30s")).toBeTruthy();

  // token list: num formatting (42000 → "42k")
  expect(screen.getByText("proj-c · ghi789")).toBeTruthy();
  expect(screen.getByText("42k")).toBeTruthy();
});

test("each list shows an empty state when its slice is empty", () => {
  wrap([], []);
  expect(screen.getAllByText("Chưa có dữ liệu.")).toHaveLength(2);
});
