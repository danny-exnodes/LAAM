import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { Citations } from "./Citations";

const wrap = (ui: React.ReactNode) => render(<I18nProvider lang="vi">{ui}</I18nProvider>);

describe("Citations", () => {
  test("rỗng → null", () => {
    const { container } = wrap(<Citations names={[]} />);
    expect(container.firstChild).toBeNull();
  });
  test("hiện Nguồn + nhãn thân thiện", () => {
    wrap(<Citations names={["laam_find_stuck"]} />);
    expect(screen.getByText(/Nguồn/)).toBeTruthy();
    expect(screen.getByText(/Tìm agent kẹt/)).toBeTruthy();
  });
});
