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

// W3 vision INTENT: cap kênh ảnh raw = 2 ảnh/lượt (VRAM 16GB + CHAT_NUM_CTX=16384).
// Thả 3 ảnh thì (1) user PHẢI thấy notice i18n vì sao ảnh 3 không đi kênh raw
// (không degrade im lặng — Rule 12), (2) cả 3 vẫn đính kèm đường OCR-text như cũ,
// (3) body /api/chat chỉ mang ĐÚNG 2 ảnh base64 KHÔNG prefix data: — client hợp lệ
// không bao giờ bị trần cứng server (400) chặn.
test("W3 vision: thả 3 ảnh → notice cap + body.images đúng 2 ảnh raw, OCR-text đủ 3", async () => {
  const chatBodies: Record<string, unknown>[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/chat" && init?.method === "POST") {
      chatBodies.push(JSON.parse(String(init.body)));
      return streamResponse(["đã nhận ảnh"]);
    }
    if (url === "/api/ocr" && init?.method === "POST")
      return { ok: true, json: async () => ({ text: "OCRTEXT" }) } as unknown as Response;
    const json = url.startsWith("/api/conversations")
      ? { conversations: [] }
      : url === "/api/ocr"
        ? { available: true }
        : url === "/api/chat/info"
          ? { model: "qwen3-vl:8b" }
          : {};
    return { ok: true, json: async () => json } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  const { container } = render(
    <I18nProvider lang="vi">
      <ChatClient />
    </I18nProvider>,
  );

  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
  const png = (name: string) => new File([new Uint8Array(8).fill(65)], name, { type: "image/png" });
  Object.defineProperty(fileInput, "files", {
    value: [png("a.png"), png("b.png"), png("c.png")],
    configurable: true,
  });
  fireEvent.change(fileInput);

  // (1) Notice i18n cho ảnh thứ 3 (chat.imgCapCount, vi).
  expect(
    await screen.findByText('Tối đa 2 ảnh mỗi lượt — "c.png" sẽ chỉ dùng văn bản OCR.'),
  ).toBeInTheDocument();
  // (2) Cả 3 ảnh vẫn đính kèm — chip hiện TÊN FILE (preview card mới). OCR-text
  // ("OCRTEXT") được prepend vào message, verify ở (3) bên dưới.
  for (const name of ["a.png", "b.png", "c.png"]) {
    expect(screen.getByText(name)).toBeInTheDocument();
  }

  // (3) Gửi → đúng 2 ảnh raw; message vẫn prefix OCR-text của CẢ 3 (flow cũ giữ nguyên).
  fireEvent.change(screen.getByLabelText("Soạn tin nhắn"), {
    target: { value: "ảnh nào đẹp hơn?" },
  });
  fireEvent.click(screen.getByLabelText("Gửi tin nhắn"));
  await waitFor(() => expect(chatBodies.length).toBe(1));
  const images = chatBodies[0].images as string[];
  expect(images).toHaveLength(2);
  for (const img of images) {
    expect(img.length).toBeGreaterThan(0);
    expect(img.startsWith("data:")).toBe(false); // raw base64, không data-URL
  }
  const message = String(chatBodies[0].message);
  expect(message).toContain("OCRTEXT");
  expect(message).toContain("c.png"); // ảnh quá cap vẫn đi đường text như cũ
});
