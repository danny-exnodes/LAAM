import { afterEach, expect, test, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { SearchClient } from "./SearchClient";

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

const EMPTY = { sessions: [], conversations: [], workflows: [] };

function setup(fetchMock = vi.fn(async () => jsonResponse(EMPTY))) {
  vi.stubGlobal("fetch", fetchMock);
  render(
    <I18nProvider lang="vi">
      <SearchClient />
    </I18nProvider>,
  );
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("renders title, input and the min-length hint; <2 chars never fetches", async () => {
  const fetchMock = setup();
  expect(screen.getByRole("heading", { name: "Tìm kiếm" })).toBeTruthy();
  const input = screen.getByPlaceholderText("Nhập từ khoá (≥ 2 ký tự)…");
  fireEvent.change(input, { target: { value: "a" } });
  // Hint stays and no request is made — short queries are dropped client-side.
  expect(screen.getByText("Nhập ít nhất 2 ký tự để tìm.")).toBeTruthy();
  await new Promise((r) => setTimeout(r, 350));
  expect(fetchMock).not.toHaveBeenCalled();
});

test("debounces: rapid keystrokes produce ONE fetch with the final term", async () => {
  const fetchMock = setup();
  const input = screen.getByPlaceholderText("Nhập từ khoá (≥ 2 ký tự)…");
  fireEvent.change(input, { target: { value: "la" } });
  fireEvent.change(input, { target: { value: "laa" } });
  fireEvent.change(input, { target: { value: "laam" } });
  await waitFor(() => expect(fetchMock).toHaveBeenCalled(), { timeout: 1500 });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith("/api/search?q=laam");
});

test("renders the three result groups with the right link targets", async () => {
  setup(
    vi.fn(async () =>
      jsonResponse({
        sessions: [
          {
            id: "s1",
            projectName: "LAAM",
            status: "running",
            latestActivity: "đang sửa bug auth",
            lastActivity: null,
          },
        ],
        conversations: [{ id: "c1", title: "Hỏi về deploy", updatedAt: null }],
        workflows: [{ id: "w1", name: "Daily digest", status: "active", updatedAt: null }],
      }),
    ),
  );
  fireEvent.change(screen.getByPlaceholderText("Nhập từ khoá (≥ 2 ký tự)…"), {
    target: { value: "deploy" },
  });

  const session = await screen.findByText("đang sửa bug auth", undefined, { timeout: 1500 });
  expect(session.closest("a")?.getAttribute("href")).toBe("/agents/s1");
  // ChatClient has no conversation deep-link param yet → plain /chat.
  expect(screen.getByText("Hỏi về deploy").closest("a")?.getAttribute("href")).toBe("/chat");
  expect(screen.getByText("Daily digest").closest("a")?.getAttribute("href")).toBe("/workflows/w1");
  // Group headings come from the search dict (vi).
  expect(screen.getByText("Phiên agent")).toBeTruthy();
  expect(screen.getByText("Hội thoại chat")).toBeTruthy();
  expect(screen.getByText("Workflow")).toBeTruthy();
});

test("empty result shows the no-results message with the query echoed", async () => {
  setup();
  fireEvent.change(screen.getByPlaceholderText("Nhập từ khoá (≥ 2 ký tự)…"), {
    target: { value: "khongco" },
  });
  const msg = await screen.findByText(/Không có kết quả cho/, undefined, { timeout: 1500 });
  expect(msg.textContent).toContain("khongco");
});

test("failed request shows the error state", async () => {
  setup(vi.fn(async () => ({ ok: false }) as Response));
  fireEvent.change(screen.getByPlaceholderText("Nhập từ khoá (≥ 2 ký tự)…"), {
    target: { value: "deploy" },
  });
  expect(await screen.findByText("Không tìm được. Thử lại.", undefined, { timeout: 1500 })).toBeTruthy();
});
