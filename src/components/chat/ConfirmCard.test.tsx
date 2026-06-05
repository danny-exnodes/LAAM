import { describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { ConfirmCard } from "./ConfirmCard";
import type { PendingWrite } from "./types";

const base: PendingWrite = {
  token: "T",
  tool: "trello_create_card",
  title: "Tạo card Trello",
  summary: 'Tạo card "Mua sữa" trong danh sách l1.',
  fields: [
    { label: "Danh sách", value: "l1" },
    { label: "Tiêu đề", value: "Mua sữa" },
  ],
  status: "idle",
};
const wrap = (p: PendingWrite, onConfirm: (a: boolean) => void = () => {}) =>
  render(
    <I18nProvider lang="vi">
      <ConfirmCard pending={p} onConfirm={onConfirm} />
    </I18nProvider>,
  );

describe("ConfirmCard", () => {
  test("render title/summary/fields", () => {
    wrap(base);
    expect(screen.getByText("Tạo card Trello")).toBeTruthy();
    expect(screen.getByText(/trong danh sách l1/)).toBeTruthy();
    expect(screen.getByText("Danh sách")).toBeTruthy();
    expect(screen.getByText("Mua sữa")).toBeTruthy();
  });
  test("idle → 2 nút; click Xác nhận/Huỷ gọi onConfirm(true/false)", () => {
    const onConfirm = vi.fn();
    wrap(base, onConfirm);
    fireEvent.click(screen.getByText("Xác nhận"));
    expect(onConfirm).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByText("Huỷ"));
    expect(onConfirm).toHaveBeenCalledWith(false);
  });
  test("sending → cả 2 nút disabled (chống double-submit)", () => {
    wrap({ ...base, status: "sending" });
    screen.getAllByRole("button").forEach((b) => expect((b as HTMLButtonElement).disabled).toBe(true));
  });
  test("done → ẩn nút, hiện badge", () => {
    wrap({ ...base, status: "done" });
    expect(screen.queryByText("Xác nhận")).toBeNull();
    expect(screen.getByText("Đã thực hiện")).toBeTruthy();
  });
  test("cancelled → badge huỷ", () => {
    wrap({ ...base, status: "cancelled" });
    expect(screen.getByText("Đã huỷ")).toBeTruthy();
  });
  test("error → badge lỗi", () => {
    wrap({ ...base, status: "error" });
    expect(screen.getByText(/Lỗi/)).toBeTruthy();
  });
});
