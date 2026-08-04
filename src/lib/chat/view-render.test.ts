import { describe, it, expect } from "vitest";
import { descriptorToChartRaw } from "./view-render";
import type { ViewDescriptor } from "@/lib/agent/view";

const base: ViewDescriptor = {
  kind: "table",
  title: "variance",
  source: { type: "tool", toolName: "t", at: 1 },
  columns: [
    { key: "store", label: "store", align: "left" },
    { key: "variance", label: "variance", align: "right" },
  ],
  rows: [{ store: "PH-005", variance: 1015 }, { store: "PH-003", variance: 542 }],
  chart: { type: "bar", labelKey: "store", valueKey: "variance" },
};

describe("descriptorToChartRaw", () => {
  it("dựng đúng JSON Chart.js mà ChartBlock đang chờ", () => {
    const parsed = JSON.parse(descriptorToChartRaw(base)!);
    expect(parsed).toEqual({
      type: "bar",
      title: "variance",
      data: {
        labels: ["PH-005", "PH-003"],
        datasets: [{ label: "variance", data: [1015, 542] }],
      },
    });
  });

  it("descriptor kind=chart (nguồn B) trả nguyên chuỗi model đã viết", () => {
    const d: ViewDescriptor = {
      kind: "chart", title: "T", source: { type: "model" },
      rows: [{ raw: '{"type":"bar"}' }],
    };
    expect(descriptorToChartRaw(d)).toBe('{"type":"bar"}');
  });

  it("không có chart → null (panel chỉ hiện bảng)", () => {
    expect(descriptorToChartRaw({ ...base, chart: undefined })).toBeNull();
  });
});
