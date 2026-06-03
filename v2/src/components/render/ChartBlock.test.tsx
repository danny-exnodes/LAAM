import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { chartToRecharts, ChartBlock } from "./ChartBlock";

describe("chartToRecharts (pure mapper)", () => {
  it("maps a bar chart with multiple datasets into rows + series", () => {
    const raw = JSON.stringify({
      type: "bar",
      title: "Doanh thu",
      data: {
        labels: ["T1", "T2"],
        datasets: [
          { label: "VND", data: [3, 5] },
          { label: "USD", data: [1, 2] },
        ],
      },
    });
    const r = chartToRecharts(raw);
    if ("error" in r) throw new Error("expected success: " + r.error);
    expect(r.kind).toBe("bar");
    expect(r.title).toBe("Doanh thu");
    expect(r.series).toHaveLength(2);
    expect(r.series[0].label).toBe("VND");
    // rows are keyed by label with each series value attached
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].name).toBe("T1");
    expect(r.rows[0][r.series[0].key]).toBe(3);
    expect(r.rows[1][r.series[1].key]).toBe(2);
    // palette: first series uses accent
    expect(r.series[0].color).toBe("#6d5efc");
  });

  it("maps a line chart to kind=line", () => {
    const r = chartToRecharts(
      JSON.stringify({
        type: "line",
        data: { labels: ["a", "b"], datasets: [{ label: "x", data: [1, 2] }] },
      }),
    );
    if ("error" in r) throw new Error("unexpected error");
    expect(r.kind).toBe("line");
  });

  it("maps a pie chart to single-series {name,value} rows", () => {
    const r = chartToRecharts(
      JSON.stringify({
        type: "pie",
        data: { labels: ["Red", "Blue"], datasets: [{ data: [10, 20] }] },
      }),
    );
    if ("error" in r) throw new Error("unexpected error");
    expect(r.kind).toBe("pie");
    expect(r.rows).toEqual([
      { name: "Red", value: 10 },
      { name: "Blue", value: 20 },
    ]);
    // pie slices get a per-row color from the palette
    expect(r.sliceColors).toBeDefined();
    expect(r.sliceColors?.[0]).toBe("#6d5efc");
  });

  it("returns an error for invalid JSON", () => {
    const r = chartToRecharts("{not json");
    expect("error" in r).toBe(true);
  });

  it("returns an error when data is missing", () => {
    const r = chartToRecharts(JSON.stringify({ type: "bar" }));
    expect("error" in r).toBe(true);
  });
});

describe("ChartBlock (component)", () => {
  it("renders a bar chart without throwing", () => {
    const raw = JSON.stringify({
      type: "bar",
      data: { labels: ["a"], datasets: [{ label: "x", data: [1] }] },
    });
    expect(() => render(<ChartBlock raw={raw} />)).not.toThrow();
  });

  it("renders a line chart without throwing", () => {
    const raw = JSON.stringify({
      type: "line",
      data: { labels: ["a"], datasets: [{ label: "x", data: [1] }] },
    });
    expect(() => render(<ChartBlock raw={raw} />)).not.toThrow();
  });

  it("renders a pie chart without throwing", () => {
    const raw = JSON.stringify({
      type: "pie",
      data: { labels: ["a", "b"], datasets: [{ data: [1, 2] }] },
    });
    expect(() => render(<ChartBlock raw={raw} />)).not.toThrow();
  });

  it("shows an error message for an invalid config", () => {
    const { container } = render(<ChartBlock raw="{nope" />);
    expect(container.textContent).toMatch(/biểu đồ|chart|invalid/i);
  });
});
