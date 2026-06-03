import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { barWidthPct, ToolWaterfall } from "./ToolWaterfall";

describe("barWidthPct (pure)", () => {
  it("scales each duration relative to the max in the set", () => {
    expect(barWidthPct(50, 100)).toBe(50);
    expect(barWidthPct(100, 100)).toBe(100);
    expect(barWidthPct(25, 100)).toBe(25);
  });

  it("clamps a minimum visible width so tiny/zero bars still show", () => {
    expect(barWidthPct(0, 100)).toBe(2);
    expect(barWidthPct(1, 100000)).toBe(2);
  });

  it("treats null duration as zero (minimum width)", () => {
    expect(barWidthPct(null, 100)).toBe(2);
  });

  it("returns full width when max is 0 or missing (avoid divide-by-zero)", () => {
    expect(barWidthPct(0, 0)).toBe(2);
    expect(barWidthPct(10, 0)).toBe(100);
  });
});

describe("ToolWaterfall (component)", () => {
  const calls = [
    { name: "Read", durationMs: 200 },
    { name: "Bash", durationMs: 1000, isError: true },
    { name: "Edit", durationMs: null },
  ];

  it("renders a row per call with the tool name", () => {
    const { getByText } = render(<ToolWaterfall calls={calls} />);
    expect(getByText("Read")).toBeTruthy();
    expect(getByText("Bash")).toBeTruthy();
    expect(getByText("Edit")).toBeTruthy();
  });

  it("renders the largest bar at 100% width and scales the rest", () => {
    const { container } = render(<ToolWaterfall calls={calls} />);
    const bars = container.querySelectorAll<HTMLElement>("[data-wf-bar]");
    expect(bars).toHaveLength(3);
    // Bash is the max (1000) → 100%; Read 200 → 20%; Edit null → clamp 2%
    expect(bars[0].style.width).toBe("20%");
    expect(bars[1].style.width).toBe("100%");
    expect(bars[2].style.width).toBe("2%");
  });

  it("marks error bars with a data attribute for red styling", () => {
    const { container } = render(<ToolWaterfall calls={calls} />);
    const bars = container.querySelectorAll<HTMLElement>("[data-wf-bar]");
    expect(bars[1].getAttribute("data-error")).toBe("true");
    expect(bars[0].getAttribute("data-error")).toBe("false");
  });

  it("renders an empty-state message when there are no calls", () => {
    const { container } = render(<ToolWaterfall calls={[]} />);
    expect(container.textContent).toMatch(/chưa có tool call/i);
  });
});
