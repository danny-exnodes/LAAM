import { expect, test, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { FilterBar } from "./FilterBar";
import { EMPTY_FILTERS } from "./filters";

function setup(onChange = vi.fn(), onExport = vi.fn()) {
  render(
    <I18nProvider lang="vi">
      <FilterBar
        value={EMPTY_FILTERS}
        onChange={onChange}
        onExport={onExport}
        projects={["LAAM", "Other"]}
        models={["m1"]}
        branches={["main"]}
      />
    </I18nProvider>,
  );
  return { onChange, onExport };
}

test("typing in search calls onChange with the new q", () => {
  const { onChange } = setup();
  fireEvent.change(screen.getByPlaceholderText("Tìm project / agent / task…"), {
    target: { value: "laam" },
  });
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ q: "laam" }));
});

test("selecting a project calls onChange with that project", () => {
  const { onChange } = setup();
  fireEvent.change(screen.getByLabelText("project-filter"), { target: { value: "Other" } });
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ project: "Other" }));
});

test("CSV button calls onExport", () => {
  const { onExport } = setup();
  fireEvent.click(screen.getByText("CSV"));
  expect(onExport).toHaveBeenCalled();
});

test("clear button resets to EMPTY_FILTERS", () => {
  const onChange = vi.fn();
  render(
    <I18nProvider lang="vi">
      <FilterBar
        value={{ ...EMPTY_FILTERS, q: "x", status: "stuck" }}
        onChange={onChange}
        onExport={vi.fn()}
        projects={[]}
        models={[]}
        branches={[]}
      />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByText("Xoá lọc"));
  expect(onChange).toHaveBeenCalledWith(EMPTY_FILTERS);
});
