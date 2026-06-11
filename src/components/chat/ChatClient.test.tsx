import { afterEach, expect, test, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { ChatClient } from "./ChatClient";

// jsdom không implement Element.scrollTo — ChatClient auto-scroll khi messages đổi.
window.HTMLElement.prototype.scrollTo = vi.fn();

// Response stream tối thiểu cho POST /api/chat (text thuần, không frame).
function streamResponse(chunks: string[], convId = "conv-1"): Response {
  let i = 0;
  return {
    ok: true,
    headers: { get: (k: string) => (k === "x-conversation-id" ? convId : null) },
    body: {
      getReader: () => ({
        read: async () =>
          i < chunks.length
            ? { done: false, value: new TextEncoder().encode(chunks[i++]) }
            : { done: true, value: undefined },
      }),
    },
  } as unknown as Response;
}

// Route theo URL; các endpoint mount (conversations/models/info/ocr) trả JSON rỗng.
function mockFetch() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/chat" && init?.method === "POST") return streamResponse(["chào bạn"]);
    const json = url.startsWith("/api/conversations")
      ? { conversations: [] }
      : url === "/api/ollama/models"
        ? { models: [] }
        : url === "/api/chat/info"
          ? { model: "test-model" }
          : url === "/api/ocr"
            ? { available: true }
            : {};
    return { ok: true, json: async () => json } as unknown as Response;
  });
}

afterEach(() => vi.unstubAllGlobals());

// UX-1 INTENT: prompt mẫu là đường tắt 1-click. Nếu click chỉ ĐIỀN composer (hành vi
// cũ) user phải bấm gửi lần nữa — click phải GỬI NGAY qua đường send hiện có.
test("click prompt mẫu gửi tin nhắn ngay, không chỉ điền vào composer", async () => {
  const fetchMock = mockFetch();
  vi.stubGlobal("fetch", fetchMock);
  render(
    <I18nProvider lang="vi">
      <ChatClient />
    </I18nProvider>,
  );
  const promptText = "Vẽ biểu đồ cột doanh thu 4 quý: 12, 19, 9, 15"; // chat.suggest4 (vi)
  fireEvent.click(await screen.findByRole("button", { name: promptText }));

  await waitFor(() => {
    const call = fetchMock.mock.calls.find(
      ([u, init]) => u === "/api/chat" && (init as RequestInit | undefined)?.method === "POST",
    );
    expect(call).toBeTruthy();
    expect(JSON.parse(String((call![1] as RequestInit).body)).message).toBe(promptText);
  });
  // Reply mock (KHÔNG echo prompt) đã stream vào bong bóng assistant.
  expect(await screen.findByText("chào bạn")).toBeInTheDocument();
  // Composer trống — không phải hành vi "điền input rồi chờ user tự gửi".
  expect((screen.getByLabelText("Soạn tin nhắn") as HTMLTextAreaElement).value).toBe("");
});
