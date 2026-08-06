import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { ConversationLog } from "./ConversationLog";
import type { Turn } from "./turns";

const turns: Turn[] = [
  { role: "user", text: "top 5 employee có tổng hoàn tiền cao nhất" },
  { role: "assistant", text: "Đứng đầu là Sarah Miller với 3.689 đô." },
];

const noop = () => {};

const renderLog = (ui: React.ReactElement) => render(<I18nProvider lang="vi">{ui}</I18nProvider>);

const props = {
  title: "Hội thoại",
  emptyLabel: "Chưa có tin nhắn nào trong phiên này.",
  closeLabel: "Đóng hội thoại",
  youLabel: "Bạn",
};

describe("ConversationLog", () => {
  it("is a region, NOT a dialog — the user keeps talking while it is open, so it must not be modal", () => {
    renderLog(<ConversationLog turns={turns} open onClose={noop} {...props} />);
    expect(screen.getByRole("region")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders every turn in order — a transcript that drops a turn is worse than none", () => {
    renderLog(<ConversationLog turns={turns} open onClose={noop} {...props} />);
    expect(screen.getByText(/top 5 employee/)).toBeTruthy();
    expect(screen.getByText(/Sarah Miller/)).toBeTruthy();
  });

  it("labels who said what — the trust boundary between the user's words and Larvis's", () => {
    renderLog(<ConversationLog turns={turns} open onClose={noop} {...props} />);
    expect(screen.getByText("Bạn")).toBeTruthy();
    expect(screen.getByText("Larvis")).toBeTruthy();
  });

  it("empty session says so instead of rendering a blank box", () => {
    renderLog(<ConversationLog turns={[]} open onClose={noop} {...props} />);
    expect(screen.getByText(/Chưa có tin nhắn nào/)).toBeTruthy();
  });

  it("× calls onClose", () => {
    const onClose = vi.fn();
    renderLog(<ConversationLog turns={turns} open onClose={onClose} {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Đóng hội thoại/ }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  // Mirrors DisplayPanel: the element stays mounted through its exit animation, so while
  // closing it must stop being announced and stop eating clicks.
  it("open=false → exit animation, hidden from screen readers, not clickable", () => {
    renderLog(<ConversationLog turns={turns} open={false} onClose={noop} {...props} />);
    const region = document.querySelector('[role="region"]')!;
    expect(region.getAttribute("aria-hidden")).toBe("true");
    expect(region.className).toContain("anim-panel-out");
    expect(region.className).toContain("pointer-events-none");
  });
});
