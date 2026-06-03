import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { SubAgentList } from "./SubAgentList";
import type { SubAgentJson } from "@/db/schema";

function wrap(items: SubAgentJson[]) {
  return render(
    <I18nProvider lang="vi">
      <SubAgentList items={items} />
    </I18nProvider>,
  );
}

test("renders the sub-agents header with count and each type", () => {
  wrap([
    { id: "1", type: "explorer", description: "scan repo", status: "done", durationMs: 2000 },
    { id: "2", type: "reviewer", description: "", status: "running", durationMs: null },
  ]);
  expect(screen.getByText("Sub-agents (2)")).toBeTruthy();
  expect(screen.getByText("explorer")).toBeTruthy();
  expect(screen.getByText("scan repo")).toBeTruthy();
  expect(screen.getByText("reviewer")).toBeTruthy();
  // missing description falls back to the i18n placeholder
  expect(screen.getByText("(không mô tả)")).toBeTruthy();
});

test("renders nothing when there are no items", () => {
  const { container } = wrap([]);
  expect(container.firstChild).toBeNull();
});
