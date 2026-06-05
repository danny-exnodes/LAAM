import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { ToolTrace } from "./ToolTrace";

const wrap = (ui: React.ReactNode) => render(<I18nProvider lang="vi">{ui}</I18nProvider>);

describe("ToolTrace", () => {
  test("rỗng → null (vô hình ca 0 tool)", () => {
    const { container } = wrap(<ToolTrace items={[]} />);
    expect(container.firstChild).toBeNull();
  });
  test("undefined → null", () => {
    const { container } = wrap(<ToolTrace items={undefined} />);
    expect(container.firstChild).toBeNull();
  });
  test("hiện tóm tắt số công cụ", () => {
    wrap(<ToolTrace items={[{ c: 0, name: "laam_find_stuck", done: true, ok: true }]} />);
    expect(screen.getByText(/Đã dùng 1 công cụ/)).toBeTruthy();
  });
});
