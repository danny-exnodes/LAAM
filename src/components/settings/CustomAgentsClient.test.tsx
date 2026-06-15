// P3.4 Custom Agents management UI. Intent: (1) tạo preset cần name+system —
// POST đúng body + list cập nhật; (2) template quick-fill điền form (không tự
// POST — user còn sửa); (3) xoá có confirm; (4) sửa → PATCH.
import { afterEach, expect, test, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { CustomAgentsClient } from "./CustomAgentsClient";

const INITIAL = [
  { id: "ca-1", name: "Tóm tắt", description: "tóm tắt văn bản", system: "Bạn là chuyên gia tóm tắt." },
];

function setup(initial = INITIAL) {
  render(
    <I18nProvider lang="vi">
      <CustomAgentsClient initial={initial} />
    </I18nProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

test("render list preset ban đầu; list rỗng → empty hint", () => {
  setup();
  expect(screen.getByText("Tóm tắt")).toBeInTheDocument();
});

test("list rỗng → hint trống", () => {
  setup([]);
  expect(screen.getByText(/Chưa có Custom Agent/i)).toBeInTheDocument();
});

test("tạo preset: điền name+system → POST body đúng, hàng mới hiện", async () => {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ ok: true, agent: { id: "ca-9", name: "Viết mail", description: null, system: "S" } }),
  })) as unknown as typeof fetch;
  vi.stubGlobal("fetch", fetchMock);
  setup([]);
  fireEvent.click(screen.getByRole("button", { name: /Tạo Custom Agent/i }));
  fireEvent.change(screen.getByLabelText(/Tên/i), { target: { value: "Viết mail" } });
  fireEvent.change(screen.getByLabelText(/System prompt/i), { target: { value: "S" } });
  fireEvent.click(screen.getByRole("button", { name: /^Lưu$/i }));
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/custom-agents",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "Viết mail", description: "", system: "S" }) }),
    );
    expect(screen.getByText("Viết mail")).toBeInTheDocument();
  });
});

test("nút Lưu disabled khi thiếu name/system", () => {
  setup([]);
  fireEvent.click(screen.getByRole("button", { name: /Tạo Custom Agent/i }));
  expect(screen.getByRole("button", { name: /^Lưu$/i })).toBeDisabled();
});

test("template quick-fill điền form (không tự POST)", () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  setup([]);
  fireEvent.click(screen.getByRole("button", { name: /Tạo Custom Agent/i }));
  fireEvent.click(screen.getByRole("button", { name: /Người tóm tắt/i }));
  expect((screen.getByLabelText(/Tên/i) as HTMLInputElement).value).toBe("Người tóm tắt");
  expect((screen.getByLabelText(/System prompt/i) as HTMLTextAreaElement).value).not.toBe("");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("xoá: confirm true → DELETE đúng id, hàng biến mất", async () => {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) })) as unknown as typeof fetch;
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("confirm", vi.fn(() => true));
  setup();
  fireEvent.click(screen.getByRole("button", { name: /Xoá/i }));
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith("/api/custom-agents/ca-1", expect.objectContaining({ method: "DELETE" }));
    expect(screen.queryByText("Tóm tắt")).not.toBeInTheDocument();
  });
});

test("sửa: đổi name → PATCH body đúng", async () => {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) })) as unknown as typeof fetch;
  vi.stubGlobal("fetch", fetchMock);
  setup();
  fireEvent.click(screen.getByRole("button", { name: /Sửa/i }));
  fireEvent.change(screen.getByLabelText(/Tên/i), { target: { value: "Tóm tắt v2" } });
  fireEvent.click(screen.getByRole("button", { name: /^Lưu$/i }));
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/custom-agents/ca-1",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(screen.getByText("Tóm tắt v2")).toBeInTheDocument();
  });
});

// P3: clone opens the CREATE form prefilled with "<name> (copy)" + system, so the
// user reviews before saving (mirrors the template quick-fill: fill, don't auto-POST).
test("nhân bản: mở form tạo prefilled '(copy)' + system, chưa POST", () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  setup();
  fireEvent.click(screen.getByRole("button", { name: /Nhân bản/i }));
  expect((screen.getByLabelText(/Tên/i) as HTMLInputElement).value).toBe("Tóm tắt (copy)");
  expect((screen.getByLabelText(/System prompt/i) as HTMLTextAreaElement).value).toBe(
    "Bạn là chuyên gia tóm tắt.",
  );
  expect(fetchMock).not.toHaveBeenCalled();
});

// P3: bridge page → chat. Each preset deep-links to the chat pre-selecting it.
test("dùng trong Chat: link tới /chat?agent=<id>", () => {
  setup();
  const link = screen.getByRole("link", { name: /Dùng trong Chat/i });
  expect(link).toHaveAttribute("href", "/chat?agent=ca-1");
});
