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
    onNew: vi.fn(),
    onClear: vi.fn(),
    onExport: vi.fn(),
    onToggleSettings: vi.fn(),
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

test("selecting /moi calls onNew and clears the input", () => {
  const props = setup({ value: "/moi" });
  fireEvent.click(screen.getByText("Cuộc trò chuyện mới"));
  expect(props.onNew).toHaveBeenCalledTimes(1);
  expect(props.onChange).toHaveBeenCalledWith("");
});

test("selecting /xoa calls onClear and clears the input", () => {
  const props = setup({ value: "/xoa" });
  fireEvent.click(screen.getByText("Xoá nội dung hội thoại"));
  expect(props.onClear).toHaveBeenCalledTimes(1);
  expect(props.onChange).toHaveBeenCalledWith("");
});

test("selecting /xuat calls onExport and clears the input", () => {
  const props = setup({ value: "/xuat" });
  fireEvent.click(screen.getByText("Xuất hội thoại"));
  expect(props.onExport).toHaveBeenCalledTimes(1);
  expect(props.onChange).toHaveBeenCalledWith("");
});

test("selecting /caidat calls onToggleSettings and clears the input", () => {
  const props = setup({ value: "/caidat" });
  fireEvent.click(screen.getByText("Cài đặt mô hình"));
  expect(props.onToggleSettings).toHaveBeenCalledTimes(1);
  expect(props.onChange).toHaveBeenCalledWith("");
});

test("Enter on a typed /moi runs the command (onNew)", () => {
  const props = setup({ value: "/moi" });
  fireEvent.keyDown(screen.getByLabelText("Soạn tin nhắn"), { key: "Enter" });
  expect(props.onNew).toHaveBeenCalledTimes(1);
});

test("URL button opens an inline input that submits to onAddUrl on Enter (UX-2)", () => {
  const props = setup();
  // No inline input until the URL button is clicked.
  expect(screen.queryByLabelText("Nhập URL để đọc")).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Đọc một URL"));
  const input = screen.getByLabelText("Nhập URL để đọc");
  fireEvent.change(input, { target: { value: "https://example.com" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(props.onAddUrl).toHaveBeenCalledWith("https://example.com");
});

test("URL inline input does not submit when empty", () => {
  const props = setup();
  fireEvent.click(screen.getByLabelText("Đọc một URL"));
  fireEvent.keyDown(screen.getByLabelText("Nhập URL để đọc"), { key: "Enter" });
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

// W3 vision: notice cap ảnh raw phải HIỂN THỊ trong composer (role=status) —
// degrade sang OCR-text mà không cho user biết là degrade im lặng (Rule 12).
test("notice (W3 vision image cap) renders inside the composer", () => {
  setup({ notice: 'Tối đa 2 ảnh mỗi lượt — "c.png" sẽ chỉ dùng văn bản OCR.' });
  expect(screen.getByRole("status")).toHaveTextContent("Tối đa 2 ảnh mỗi lượt");
});

test("dropping files calls onAddFiles", () => {
  const props = setup();
  const file = new File(["data"], "drop.txt", { type: "text/plain" });
  const zone = screen.getByLabelText("Soạn tin nhắn").closest("div")!;
  fireEvent.drop(zone, { dataTransfer: { files: [file], types: ["Files"] } });
  expect(props.onAddFiles).toHaveBeenCalled();
});

// ── P1 quick-tools picker ────────────────────────────────────────────────────
// Intent: user CHỌN tool tường minh + UI dẫn nhập required-args (project_id UUID…)
// — đòn bẩy reliability thay cho prompt-tune (decision chat-mcp-quicktools).

const toolGroupsFx = [
  {
    id: "mcp:daab",
    type: "mcp" as const,
    label: "DAAB",
    tools: [
      {
        name: "mcp__daab__kg_query",
        description: "truy vấn knowledge graph",
        kind: "read" as const,
        args: [{ key: "project_id", kind: "string" as const, description: "UUID dự án", required: true }],
      },
    ],
  },
  {
    id: "connector:demo",
    type: "connector" as const,
    label: "Demo",
    tools: [
      {
        name: "demo_create_task",
        description: "tạo task mẫu",
        kind: "write" as const,
        args: [{ key: "title", kind: "string" as const, required: true }],
      },
    ],
  },
];

const pickFx = {
  tool: toolGroupsFx[0].tools[0],
  groupLabel: "DAAB",
  args: {},
};

test("gõ '/' hiện section Công cụ với tool từ catalog (kèm nhóm)", () => {
  setup({ value: "/", toolGroups: toolGroupsFx });
  expect(screen.getByText("Công cụ")).toBeInTheDocument();
  expect(screen.getByText("mcp__daab__kg_query")).toBeInTheDocument();
  expect(screen.getByText("demo_create_task")).toBeInTheDocument();
  expect(screen.getByText("DAAB")).toBeInTheDocument();
});

test("slash query filter tool theo tên/mô tả", () => {
  setup({ value: "/kg", toolGroups: toolGroupsFx });
  expect(screen.getByText("mcp__daab__kg_query")).toBeInTheDocument();
  expect(screen.queryByText("demo_create_task")).not.toBeInTheDocument();
});

test("click tool → onToolPick với tool + groupLabel", () => {
  const onToolPick = vi.fn();
  setup({ value: "/kg", toolGroups: toolGroupsFx, onToolPick });
  fireEvent.click(screen.getByText("mcp__daab__kg_query"));
  expect(onToolPick).toHaveBeenCalledWith({
    tool: expect.objectContaining({ name: "mcp__daab__kg_query" }),
    groupLabel: "DAAB",
  });
});

test("toolPick thiếu required arg → send disabled + hint thiếu tham số", () => {
  setup({ value: "tra cứu cá hồi", toolPick: pickFx });
  expect(screen.getByLabelText("Gửi tin nhắn")).toBeDisabled();
  expect(screen.getByText(/Thiếu tham số bắt buộc/)).toHaveTextContent("project_id");
  // input required-arg hiển thị để user dán UUID
  expect(screen.getByLabelText("project_id")).toBeInTheDocument();
});

test("điền required arg → onToolArg; đủ args → send enabled kể cả text rỗng", () => {
  const onToolArg = vi.fn();
  setup({ value: "", toolPick: { ...pickFx, args: { project_id: "1f991b74-x" } }, onToolArg });
  expect(screen.getByLabelText("Gửi tin nhắn")).not.toBeDisabled();
  fireEvent.change(screen.getByLabelText("project_id"), { target: { value: "abc" } });
  expect(onToolArg).toHaveBeenCalledWith("project_id", "abc");
});

test("✕ trên chip → onToolPick(null)", () => {
  const onToolPick = vi.fn();
  setup({ toolPick: pickFx, onToolPick });
  fireEvent.click(screen.getByLabelText("Bỏ chọn công cụ"));
  expect(onToolPick).toHaveBeenCalledWith(null);
});

test("Enter khi slash-menu chỉ khớp tool → pick tool đầu tiên (không gửi)", () => {
  const onToolPick = vi.fn();
  const props = setup({ value: "/kg", toolGroups: toolGroupsFx, onToolPick });
  fireEvent.keyDown(screen.getByLabelText("Soạn tin nhắn"), { key: "Enter" });
  expect(onToolPick).toHaveBeenCalledTimes(1);
  expect(props.onSend).not.toHaveBeenCalled();
});
