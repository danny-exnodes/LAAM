import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { DisplayPanel } from "./DisplayPanel";
import type { ViewDescriptor } from "@/lib/agent/view";

const view: ViewDescriptor = {
  kind: "table",
  title: "variance",
  source: { type: "tool", toolName: "kg_stats", at: Date.parse("2026-08-04T08:42:00Z") },
  columns: [
    { key: "store", label: "Store", align: "left" },
    { key: "variance", label: "Variance", align: "right" },
  ],
  rows: [
    { store: "PH-005", variance: 1015 },
    { store: "PH-003", variance: 542 },
    { store: "PH-001", variance: 515 },
    { store: "PH-004", variance: 492 },
  ],
  truncated: { shown: 4, total: 666 },
};

const noop = () => {};

const renderPanel = (ui: React.ReactElement) =>
  render(<I18nProvider lang="vi">{ui}</I18nProvider>);

describe("DisplayPanel", () => {
  it("là region, KHÔNG phải dialog — panel không modal, gắn dialog là nói dối screen reader", () => {
    renderPanel(<DisplayPanel views={[view]} density="detail" onClose={noop} onToggleDensity={noop} agentLabel="DAAB" />);
    expect(screen.getByRole("region")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("hiện đủ dòng ở mật độ detail", () => {
    renderPanel(<DisplayPanel views={[view]} density="detail" onClose={noop} onToggleDensity={noop} agentLabel="DAAB" />);
    expect(screen.getAllByRole("row")).toHaveLength(5); // 1 header + 4 dữ liệu
  });

  it("mật độ focus chỉ 3 dòng — liếc mắt đọc được, không phải bảng đầy", () => {
    renderPanel(<DisplayPanel views={[view]} density="focus" onClose={noop} onToggleDensity={noop} agentLabel="DAAB" />);
    expect(screen.getAllByRole("row")).toHaveLength(4); // 1 header + 3 dữ liệu
  });

  it("nói rõ đã cắt bớt — im lặng cắt sẽ khiến user tưởng chỉ có 4 dòng", () => {
    renderPanel(<DisplayPanel views={[view]} density="detail" onClose={noop} onToggleDensity={noop} agentLabel="DAAB" />);
    expect(screen.getByText(/4\/666/)).toBeTruthy();
  });

  it("badge nguồn tool hiện nhãn agent; nguồn model hiện 'AI tổng hợp' — hai mức tin cậy khác nhau", () => {
    const { rerender } = renderPanel(
      <DisplayPanel views={[view]} density="detail" onClose={noop} onToggleDensity={noop} agentLabel="DAAB" />,
    );
    expect(screen.getByText(/DAAB/)).toBeTruthy();
    rerender(
      <I18nProvider lang="vi">
        <DisplayPanel
          views={[{ ...view, source: { type: "model" } }]}
          density="detail" onClose={noop} onToggleDensity={noop} agentLabel="DAAB"
        />
      </I18nProvider>,
    );
    // 3 ngôn ngữ vì test không cố định cookie laam_lang; điều được khẳng định là
    // nhãn agent BIẾN MẤT — không được để bảng model tự viết trông như bảng từ DB.
    expect(screen.getByText(/AI tổng hợp|AI generated|AI 生成/)).toBeTruthy();
    expect(screen.queryByText(/DAAB/)).toBeNull();
  });

  it("stat descriptor (kind='stat') render bảng 1 cột — không được để panel rỗng dù pointer nói có bảng", () => {
    renderPanel(
      <DisplayPanel
        views={[{
          kind: "stat",
          title: "kg_count_open_tickets",
          source: { type: "tool", toolName: "kg_count_open_tickets", at: Date.parse("2026-08-04T08:42:00Z") },
          columns: [{ key: "value", label: "kg_count_open_tickets", align: "right" }],
          rows: [{ value: 666 }],
        }]}
        density="detail" onClose={noop} onToggleDensity={noop} agentLabel="DAAB"
      />,
    );
    expect(screen.getByRole("region")).not.toBeEmptyDOMElement();
    expect(screen.getByText("666")).toBeTruthy();
  });

  it("stat descriptor vẫn render ở mật độ focus — cùng luật với chart-only, không rỗng", () => {
    renderPanel(
      <DisplayPanel
        views={[{
          kind: "stat",
          title: "kg_count_open_tickets",
          source: { type: "tool", toolName: "kg_count_open_tickets", at: Date.parse("2026-08-04T08:42:00Z") },
          columns: [{ key: "value", label: "kg_count_open_tickets", align: "right" }],
          rows: [{ value: 666 }],
        }]}
        density="focus" onClose={noop} onToggleDensity={noop} agentLabel="DAAB"
      />,
    );
    expect(screen.getByText("666")).toBeTruthy();
  });

  it("chart-only descriptor (nguồn B) vẫn render ở mật độ focus — không để panel rỗng", () => {
    renderPanel(
      <DisplayPanel
        views={[{ kind: "chart", title: "T", source: { type: "model" }, rows: [{ raw: '{"type":"bar","data":{"labels":["a"],"datasets":[{"data":[1]}]}}' }] }]}
        density="focus" onClose={noop} onToggleDensity={noop} agentLabel="DAAB"
      />,
    );
    expect(screen.getByRole("region")).not.toBeEmptyDOMElement();
  });

  // /chat hiện CẢ bảng lẫn chart cho một câu "top 5 …". Panel trước đây chỉ nhận MỘT
  // descriptor nên model trả hai khối thì user chỉ thấy chart — mất hẳn bảng số.
  it("nhiều descriptor trong một lượt → render HẾT, không nuốt bớt cái nào", () => {
    renderPanel(
      <DisplayPanel
        views={[
          view, // bảng: có cột Store/Variance
          {
            kind: "chart",
            title: "Top 5",
            source: { type: "model" },
            rows: [{ raw: '{"type":"bar","data":{"labels":["a"],"datasets":[{"data":[1]}]}}' }],
          },
        ]}
        density="detail" onClose={noop} onToggleDensity={noop} agentLabel="DAAB"
      />,
    );
    // bảng vẫn còn (header + 4 dòng dữ liệu của `view`)…
    expect(screen.getAllByRole("row")).toHaveLength(5);
    // …và chart cũng được render cùng lúc, không phải một trong hai.
    expect(document.querySelector(".chat-chart")).toBeTruthy();
  });

  it("nút × gọi onClose", () => {
    const onClose = vi.fn();
    renderPanel(<DisplayPanel views={[view]} density="detail" onClose={onClose} onToggleDensity={noop} agentLabel="DAAB" />);
    fireEvent.click(screen.getByRole("button", { name: /Đóng bảng|Close table/ }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("Esc gọi onClose", () => {
    const onClose = vi.fn();
    renderPanel(<DisplayPanel views={[view]} density="detail" onClose={onClose} onToggleDensity={noop} agentLabel="DAAB" />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("click ra ngoài KHÔNG đóng — user chạm màn hình lúc đang nói là chuyện thường", () => {
    const onClose = vi.fn();
    render(
      <I18nProvider lang="vi">
        <div data-testid="outside">
          <DisplayPanel views={[view]} density="detail" onClose={onClose} onToggleDensity={noop} agentLabel="DAAB" />
        </div>
      </I18nProvider>,
    );
    fireEvent.click(screen.getByTestId("outside"));
    expect(onClose).not.toHaveBeenCalled();
  });
});
