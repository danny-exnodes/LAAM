import { expect, test, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { MessageList } from "./MessageList";
import type { ChatMsg } from "./types";

const msgs: ChatMsg[] = [
  { id: "u1", role: "user", content: "hi" },
  { id: "a1", role: "assistant", content: "hello there" },
];
const cbs = {
  onCopy: vi.fn(),
  onEdit: vi.fn(),
  onRegenerate: vi.fn(),
  onDelete: vi.fn(),
};

function wrap(ui: React.ReactNode) {
  return render(<I18nProvider lang="vi">{ui}</I18nProvider>);
}

beforeEach(() => {
  cbs.onCopy.mockClear();
  cbs.onEdit.mockClear();
  cbs.onRegenerate.mockClear();
  cbs.onDelete.mockClear();
});

test("renders one item per message", () => {
  wrap(<MessageList messages={msgs} streaming={false} {...cbs} />);
  expect(screen.getByText("hi")).toBeInTheDocument();
  expect(screen.getByText("hello there")).toBeInTheDocument();
});

test("passes callbacks through to the right item", () => {
  wrap(<MessageList messages={msgs} streaming={false} {...cbs} />);
  // Two copy buttons (one per message); clicking the assistant's reports its msg.
  fireEvent.click(screen.getAllByTitle("Chép nội dung tin nhắn")[1]);
  expect(cbs.onCopy).toHaveBeenCalledWith(msgs[1]);
});

test("renders a scroll-anchor element at the end", () => {
  const { container } = wrap(<MessageList messages={msgs} streaming={false} {...cbs} />);
  expect(container.querySelector("[data-scroll-anchor]")).toBeInTheDocument();
});

test("renders nothing but the anchor for an empty list", () => {
  const { container } = wrap(<MessageList messages={[]} streaming={false} {...cbs} />);
  expect(container.querySelector("[data-scroll-anchor]")).toBeInTheDocument();
  expect(screen.queryByTitle("Chép nội dung tin nhắn")).toBeNull();
});
