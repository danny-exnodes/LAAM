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

// P1 quick-tools: catalog fixture cho /api/chat/tools (picker).
const TOOL_GROUPS_FX = [
  {
    id: "mcp:daab",
    type: "mcp",
    label: "DAAB",
    tools: [
      {
        name: "mcp__daab__kg_query",
        description: "truy vấn knowledge graph",
        kind: "read",
        args: [{ key: "project_id", kind: "string", description: "UUID dự án", required: true }],
      },
    ],
  },
];

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
            : url === "/api/chat/tools"
              ? { groups: TOOL_GROUPS_FX }
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

// C2: Claude model selected → inline cost/scope note must appear.
// INTENT: Users must see the honesty note BEFORE they type (QUYẾT ĐỊNH #6) so
// they understand Claude API != their personal Claude subscription quota.
test("C2: Claude model active → claudeNote shown near composer", async () => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/chat" && init?.method === "POST") return streamResponse(["ok"]);
    const json = url.startsWith("/api/conversations")
      ? { conversations: [] }
      : url === "/api/ollama/models"
        ? { models: ["gemma4:e4b"] }
        : url === "/api/chat/info"
          ? { model: "claude-sonnet-4-6", claudeModels: ["claude-sonnet-4-6", "claude-opus-4-8"] }
          : url === "/api/ocr"
            ? { available: true }
            : {};
    return { ok: true, json: async () => json } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  render(
    <I18nProvider lang="vi">
      <ChatClient />
    </I18nProvider>,
  );
  // The note must appear once /api/chat/info resolves and the claude model is active.
  await waitFor(() => {
    expect(screen.getByRole("note")).toBeInTheDocument();
  });
  // Verify the note contains the key phrase about org key billing.
  expect(screen.getByRole("note").textContent).toContain("key chung của org");
});

// C2: Local (Ollama) model active → claudeNote must NOT appear.
// INTENT: local model is free — showing the billing note when there's nothing to bill
// would confuse users and undermine the core "$0 local model" value proposition.
test("C2: local model active → claudeNote NOT shown", async () => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/chat" && init?.method === "POST") return streamResponse(["ok"]);
    const json = url.startsWith("/api/conversations")
      ? { conversations: [] }
      : url === "/api/ollama/models"
        ? { models: ["gemma4:e4b"] }
        : url === "/api/chat/info"
          // claudeModels available but default model is local
          ? { model: "gemma4:e4b", claudeModels: ["claude-sonnet-4-6"] }
          : url === "/api/ocr"
            ? { available: true }
            : {};
    return { ok: true, json: async () => json } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  render(
    <I18nProvider lang="vi">
      <ChatClient />
    </I18nProvider>,
  );
  // Wait for info fetch to settle (model loads).
  await waitFor(() => {
    expect(
      (fetchMock.mock.calls.some(([u]) => u === "/api/chat/info")),
    ).toBe(true);
  });
  // After a tick, no billing note should be visible.
  await new Promise((r) => setTimeout(r, 50));
  expect(screen.queryByRole("note")).toBeNull();
});

// P1 quick-tools INTENT: user chọn tool + dán required-arg (UUID) → body /api/chat
// phải mang requestedTool {name, args} để server pre-dispatch deterministic — model
// không phải đoán selection/args. Sau khi gửi, pick được clear (1 lượt 1 tool).
test("pick tool từ slash menu, điền arg, gửi → body có requestedTool; sau gửi pick clear", async () => {
  const fetchMock = mockFetch();
  vi.stubGlobal("fetch", fetchMock);
  render(
    <I18nProvider lang="vi">
      <ChatClient />
    </I18nProvider>,
  );
  // Chờ catalog nạp xong rồi mở slash menu.
  await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => u === "/api/chat/tools")).toBe(true));
  const ta = screen.getByLabelText("Soạn tin nhắn");
  fireEvent.change(ta, { target: { value: "/kg" } });
  fireEvent.click(await screen.findByText("mcp__daab__kg_query"));

  // Chip + input required-arg hiện ra; điền UUID + text yêu cầu rồi gửi.
  fireEvent.change(screen.getByLabelText("project_id"), { target: { value: "1f991b74-aaaa" } });
  fireEvent.change(ta, { target: { value: "tìm 'cá hồi' trong KG" } });
  fireEvent.click(screen.getByLabelText("Gửi tin nhắn"));

  await waitFor(() => {
    const call = fetchMock.mock.calls.find(
      ([u, init]) => u === "/api/chat" && (init as RequestInit | undefined)?.method === "POST",
    );
    expect(call).toBeTruthy();
    const body = JSON.parse(String((call![1] as RequestInit).body));
    expect(body.requestedTool).toEqual({ name: "mcp__daab__kg_query", args: { project_id: "1f991b74-aaaa" } });
    expect(body.message).toBe("tìm 'cá hồi' trong KG");
  });
  // Pick clear sau khi gửi — không dính sang lượt sau.
  await waitFor(() => expect(screen.queryByLabelText("Bỏ chọn công cụ")).toBeNull());
});

// P1: toolPick + composer TRỐNG → vẫn gửi được, message = câu mặc định i18n (server
// đòi message non-empty; client tự thay vì user chỉ cần chọn tool + args).
test("toolPick với args đủ + text rỗng → gửi message mặc định", async () => {
  const fetchMock = mockFetch();
  vi.stubGlobal("fetch", fetchMock);
  render(
    <I18nProvider lang="vi">
      <ChatClient />
    </I18nProvider>,
  );
  await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => u === "/api/chat/tools")).toBe(true));
  const ta = screen.getByLabelText("Soạn tin nhắn");
  fireEvent.change(ta, { target: { value: "/kg" } });
  fireEvent.click(await screen.findByText("mcp__daab__kg_query"));
  fireEvent.change(screen.getByLabelText("project_id"), { target: { value: "u-1" } });
  fireEvent.click(screen.getByLabelText("Gửi tin nhắn"));

  await waitFor(() => {
    const call = fetchMock.mock.calls.find(
      ([u, init]) => u === "/api/chat" && (init as RequestInit | undefined)?.method === "POST",
    );
    expect(call).toBeTruthy();
    const body = JSON.parse(String((call![1] as RequestInit).body));
    expect(body.message).toBe("Gọi công cụ mcp__daab__kg_query với tham số đã nhập.");
    expect(body.requestedTool.args).toEqual({ project_id: "u-1" });
  });
});

// ── Constellation command-center ────────────────────────────────────────────
// Mock incl. /api/custom-agents so the inner ring has an agent node.
function mockFetchWithAgents() {
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
            : url === "/api/chat/tools"
              ? { groups: TOOL_GROUPS_FX }
              : url === "/api/custom-agents"
                ? { agents: [{ id: "ag-1", name: "Strategist" }] }
                : {};
    return { ok: true, json: async () => json } as unknown as Response;
  });
}

function renderChat() {
  return render(
    <I18nProvider lang="vi">
      <ChatClient />
    </I18nProvider>,
  );
}

test("empty-state links to the constellation page", async () => {
  vi.stubGlobal("fetch", mockFetchWithAgents());
  renderChat();
  const links = await screen.findAllByRole("link", { name: /bản đồ trợ lý|assistant/i });
  expect(links.some((l) => l.getAttribute("href") === "/constellation")).toBe(true);
});
