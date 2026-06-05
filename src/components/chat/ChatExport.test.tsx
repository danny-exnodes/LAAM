import { expect, test, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";

// Mock the Wave 0 export helpers so the test asserts what the buttons hand them,
// without touching Blob / anchor download machinery (mirrors DashboardExport.test).
const downloadMarkdown = vi.fn();
const downloadJson = vi.fn();
const downloadPdf = vi.fn();
const toMarkdown = vi.fn((..._a: unknown[]) => "MD-OUTPUT");
vi.mock("@/lib/export", () => ({
  downloadMarkdown: (...a: unknown[]) => downloadMarkdown(...a),
  downloadJson: (...a: unknown[]) => downloadJson(...a),
  downloadPdf: (...a: unknown[]) => downloadPdf(...a),
  toMarkdown: (...a: unknown[]) => toMarkdown(...a),
}));

// Import after the mock is registered.
import { ChatExport } from "./ChatExport";
import type { ChatMsg } from "./types";

const msgs: ChatMsg[] = [
  { id: "u1", role: "user", content: "hi" },
  { id: "a1", role: "assistant", content: "hello" },
];

function wrap() {
  return render(
    <I18nProvider lang="vi">
      <ChatExport messages={msgs} title="my-chat" />
    </I18nProvider>,
  );
}

beforeEach(() => {
  downloadMarkdown.mockClear();
  downloadJson.mockClear();
  downloadPdf.mockClear();
  toMarkdown.mockClear();
});

test("download options are hidden until the dropdown is opened", () => {
  wrap();
  expect(screen.queryByText("Tải .md")).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Xuất hội thoại"));
  expect(screen.getByText("Tải .md")).toBeInTheDocument();
});

test("MD item (via dropdown) downloads toMarkdown(messages) under <title>.md", () => {
  wrap();
  fireEvent.click(screen.getByLabelText("Xuất hội thoại"));
  fireEvent.click(screen.getByText("Tải .md"));
  expect(toMarkdown).toHaveBeenCalledWith(msgs);
  expect(downloadMarkdown).toHaveBeenCalledTimes(1);
  expect(downloadMarkdown).toHaveBeenCalledWith("my-chat.md", "MD-OUTPUT");
});

test("JSON item (via dropdown) downloads the messages array under <title>.json", () => {
  wrap();
  fireEvent.click(screen.getByLabelText("Xuất hội thoại"));
  fireEvent.click(screen.getByText("Tải .json"));
  expect(downloadJson).toHaveBeenCalledTimes(1);
  expect(downloadJson).toHaveBeenCalledWith("my-chat.json", msgs);
});

test("PDF item (FEAT-3) renders the markdown body under <title>.pdf", () => {
  wrap();
  fireEvent.click(screen.getByLabelText("Xuất hội thoại"));
  fireEvent.click(screen.getByText("Tải .pdf"));
  expect(downloadPdf).toHaveBeenCalledTimes(1);
  expect(downloadPdf).toHaveBeenCalledWith("my-chat.pdf", "my-chat", "MD-OUTPUT");
});

test("Copy-conversation item (FEAT-3) writes the markdown to the clipboard", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  wrap();
  fireEvent.click(screen.getByLabelText("Xuất hội thoại"));
  fireEvent.click(screen.getByText("Sao chép Markdown"));
  expect(writeText).toHaveBeenCalledWith("MD-OUTPUT");
});

test("shows the conversation token total (FEAT-3)", () => {
  render(
    <I18nProvider lang="vi">
      <ChatExport
        title="t"
        messages={[
          { id: "a", role: "assistant", content: "x", tokensIn: 201, tokensOut: 193 },
          { id: "b", role: "assistant", content: "y", tokensIn: 10, tokensOut: 5 },
        ]}
      />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByLabelText("Xuất hội thoại"));
  // 201+193+10+5 = 409
  expect(screen.getByText(/409 token/)).toBeInTheDocument();
});
