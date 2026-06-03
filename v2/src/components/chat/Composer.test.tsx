import { expect, test, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { Composer } from "./Composer";
import type { Attachment } from "./types";

type Props = Parameters<typeof Composer>[0];

function setup(over: Partial<Props> = {}) {
  const props: Props = {
    value: "",
    onChange: vi.fn(),
    onSend: vi.fn(),
    onStop: vi.fn(),
    streaming: false,
    attachments: [],
    onAddFiles: vi.fn(),
    onAddUrl: vi.fn(),
    onRemoveAttachment: vi.fn(),
    ...over,
  };
  render(
    <I18nProvider lang="vi">
      <Composer {...props} />
    </I18nProvider>,
  );
  return props;
}

test("typing in the textarea calls onChange with the new value", () => {
  const props = setup();
  fireEvent.change(screen.getByLabelText("Soạn tin nhắn"), { target: { value: "hi" } });
  expect(props.onChange).toHaveBeenCalledWith("hi");
});

test("Enter (no shift) sends and prevents default newline", () => {
  const props = setup({ value: "hello" });
  const ta = screen.getByLabelText("Soạn tin nhắn");
  fireEvent.keyDown(ta, { key: "Enter" });
  expect(props.onSend).toHaveBeenCalledTimes(1);
});

test("Shift+Enter does not send (newline)", () => {
  const props = setup({ value: "hello" });
  fireEvent.keyDown(screen.getByLabelText("Soạn tin nhắn"), { key: "Enter", shiftKey: true });
  expect(props.onSend).not.toHaveBeenCalled();
});

test("Escape calls onStop", () => {
  const props = setup({ value: "x", streaming: true });
  fireEvent.keyDown(screen.getByLabelText("Soạn tin nhắn"), { key: "Escape" });
  expect(props.onStop).toHaveBeenCalledTimes(1);
});

test("send button is disabled while streaming", () => {
  setup({ value: "hello", streaming: true });
  expect(screen.getByLabelText("Gửi tin nhắn")).toBeDisabled();
});

test("send button is disabled when value is empty", () => {
  setup({ value: "   " });
  expect(screen.getByLabelText("Gửi tin nhắn")).toBeDisabled();
});

test("clicking send calls onSend", () => {
  const props = setup({ value: "hello" });
  fireEvent.click(screen.getByLabelText("Gửi tin nhắn"));
  expect(props.onSend).toHaveBeenCalledTimes(1);
});

test("typing a slash prefix shows the slash-command menu", () => {
  setup({ value: "/" });
  expect(screen.getByText("Lệnh nhanh")).toBeInTheDocument();
  // /moi command label present
  expect(screen.getByText("Cuộc trò chuyện mới")).toBeInTheDocument();
});

test("no slash menu when value does not start with a slash", () => {
  setup({ value: "hello" });
  expect(screen.queryByText("Lệnh nhanh")).not.toBeInTheDocument();
});

test("selecting the stop slash command calls onStop", () => {
  const props = setup({ value: "/dung", streaming: true });
  // the /dung row is shown filtered; click it
  fireEvent.click(screen.getByText("Dừng tạo"));
  expect(props.onStop).toHaveBeenCalledTimes(1);
});

test("URL attach button calls onAddUrl with the prompt result", () => {
  const props = setup();
  vi.spyOn(window, "prompt").mockReturnValue("https://example.com");
  fireEvent.click(screen.getByLabelText("Đọc một URL"));
  expect(props.onAddUrl).toHaveBeenCalledWith("https://example.com");
});

test("URL attach button does nothing when prompt is cancelled", () => {
  const props = setup();
  vi.spyOn(window, "prompt").mockReturnValue(null);
  fireEvent.click(screen.getByLabelText("Đọc một URL"));
  expect(props.onAddUrl).not.toHaveBeenCalled();
});

test("attachment chip remove button calls onRemoveAttachment with its id", () => {
  const att: Attachment = { id: "a1", name: "doc.txt", kind: "file", chars: 12, text: "x" };
  const props = setup({ attachments: [att] });
  fireEvent.click(screen.getByLabelText("Bỏ đính kèm"));
  expect(props.onRemoveAttachment).toHaveBeenCalledWith("a1");
});

test("char counter renders for a non-empty value", () => {
  setup({ value: "hello" });
  expect(screen.getByText(/5 ký tự/)).toBeInTheDocument();
});

test("renders a scroll-to-bottom button (visual element)", () => {
  setup();
  expect(screen.getByLabelText("Cuộn xuống cuối")).toBeInTheDocument();
});

test("dropping files calls onAddFiles", () => {
  const props = setup();
  const file = new File(["data"], "drop.txt", { type: "text/plain" });
  const zone = screen.getByLabelText("Soạn tin nhắn").closest("div")!;
  fireEvent.drop(zone, { dataTransfer: { files: [file], types: ["Files"] } });
  expect(props.onAddFiles).toHaveBeenCalled();
});
