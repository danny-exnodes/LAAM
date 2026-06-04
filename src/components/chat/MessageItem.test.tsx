import { expect, test, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";

// MarkdownView is exercised in Wave 0; here we only confirm assistant content
// flows THROUGH it (a table renders), so the real component is used.
import { MessageItem } from "./MessageItem";
import type { ChatMsg } from "./types";

function noop() {}
const cbs = { onCopy: noop, onEdit: noop, onRegenerate: noop, onDelete: noop };

function wrap(ui: React.ReactNode) {
  return render(<I18nProvider lang="vi">{ui}</I18nProvider>);
}

test("assistant markdown table renders through MarkdownView", () => {
  const m: ChatMsg = {
    id: "a1",
    role: "assistant",
    content: "| A | B |\n|---|---|\n| 1 | 2 |",
  };
  wrap(<MessageItem msg={m} streaming={false} {...cbs} />);
  expect(screen.getByRole("table")).toBeInTheDocument();
  expect(screen.getByText("A")).toBeInTheDocument();
});

test("user message renders as plain text (no markdown table)", () => {
  const m: ChatMsg = {
    id: "u1",
    role: "user",
    content: "| A | B |\n|---|---|\n| 1 | 2 |",
  };
  wrap(<MessageItem msg={m} streaming={false} {...cbs} />);
  expect(screen.queryByRole("table")).toBeNull();
  // The literal pipe text is shown verbatim (not parsed as a table).
  expect(screen.getByText(/\| A \| B \|/)).toBeInTheDocument();
});

test("empty assistant message while streaming shows the typing placeholder", () => {
  const m: ChatMsg = { id: "a2", role: "assistant", content: "" };
  wrap(<MessageItem msg={m} streaming={true} {...cbs} />);
  expect(screen.getByText("đang soạn…")).toBeInTheDocument();
});

test("copy button calls onCopy with the message", () => {
  const onCopy = vi.fn();
  const m: ChatMsg = { id: "a3", role: "assistant", content: "hello" };
  wrap(<MessageItem msg={m} streaming={false} {...cbs} onCopy={onCopy} />);
  fireEvent.click(screen.getByTitle("Chép nội dung tin nhắn"));
  expect(onCopy).toHaveBeenCalledWith(m);
});

test("edit shows for user only; regenerate for assistant only", () => {
  const u: ChatMsg = { id: "u2", role: "user", content: "hi" };
  const { rerender } = wrap(<MessageItem msg={u} streaming={false} {...cbs} />);
  expect(screen.queryByTitle("Sửa & gửi lại tin nhắn")).toBeInTheDocument();
  expect(screen.queryByTitle("Tạo lại câu trả lời")).toBeNull();

  const a: ChatMsg = { id: "a4", role: "assistant", content: "yo" };
  rerender(
    <I18nProvider lang="vi">
      <MessageItem msg={a} streaming={false} {...cbs} />
    </I18nProvider>,
  );
  expect(screen.queryByTitle("Sửa & gửi lại tin nhắn")).toBeNull();
  expect(screen.queryByTitle("Tạo lại câu trả lời")).toBeInTheDocument();
});

test("delete/regenerate disabled while streaming; copy stays enabled", () => {
  const a: ChatMsg = { id: "a5", role: "assistant", content: "done text" };
  wrap(<MessageItem msg={a} streaming={true} {...cbs} />);
  expect(screen.getByTitle("Xoá tin nhắn này")).toBeDisabled();
  expect(screen.getByTitle("Tạo lại câu trả lời")).toBeDisabled();
  expect(screen.getByTitle("Chép nội dung tin nhắn")).toBeEnabled();
});

test("regenerate / delete callbacks fire with the message", () => {
  const onRegenerate = vi.fn();
  const onDelete = vi.fn();
  const a: ChatMsg = { id: "a6", role: "assistant", content: "x" };
  wrap(
    <MessageItem
      msg={a}
      streaming={false}
      {...cbs}
      onRegenerate={onRegenerate}
      onDelete={onDelete}
    />,
  );
  fireEvent.click(screen.getByTitle("Tạo lại câu trả lời"));
  fireEvent.click(screen.getByTitle("Xoá tin nhắn này"));
  expect(onRegenerate).toHaveBeenCalledWith(a);
  expect(onDelete).toHaveBeenCalledWith(a);
});

test("edit callback fires for a user message", () => {
  const onEdit = vi.fn();
  const u: ChatMsg = { id: "u3", role: "user", content: "edit me" };
  wrap(<MessageItem msg={u} streaming={false} {...cbs} onEdit={onEdit} />);
  fireEvent.click(screen.getByTitle("Sửa & gửi lại tin nhắn"));
  expect(onEdit).toHaveBeenCalledWith(u);
});

test("shows a relative timestamp when createdAt is present", () => {
  const a: ChatMsg = {
    id: "a7",
    role: "assistant",
    content: "x",
    createdAt: Date.now() - 5 * 60_000,
  };
  wrap(<MessageItem msg={a} streaming={false} {...cbs} />);
  expect(screen.getByText("5 phút trước")).toBeInTheDocument();
});
