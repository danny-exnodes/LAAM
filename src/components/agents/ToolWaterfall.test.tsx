import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { waterfallSpan, barGeom, ToolWaterfall } from "./ToolWaterfall";

describe("waterfallSpan (pure)", () => {
  it("derives an absolute span from call timestamps", () => {
    const g = waterfallSpan([
      { name: "a", start: 1000, end: 1200, durationMs: 200 },
      { name: "b", start: 1200, end: 2200, durationMs: 1000 },
    ]);
    expect(g.absolute).toBe(true);
    expect(g.t0).toBe(1000);
    expect(g.span).toBe(1200); // 2200 - 1000
  });

  it("falls back to a max-duration scale when no timestamps are present", () => {
    const g = waterfallSpan([
      { name: "a", durationMs: 50 },
      { name: "b", durationMs: 100 },
    ]);
    expect(g.absolute).toBe(false);
    expect(g.span).toBe(100);
  });
});

describe("barGeom (pure)", () => {
  it("offsets each bar by start time and sizes it by duration (absolute)", () => {
    const g = waterfallSpan([
      { name: "a", start: 1000, end: 1200, durationMs: 200 },
      { name: "b", start: 1200, end: 2200, durationMs: 1000 },
    ]);
    const [aLeft, aWidth] = barGeom({ name: "a", start: 1000, durationMs: 200 }, g);
    const [bLeft, bWidth] = barGeom({ name: "b", start: 1200, durationMs: 1000 }, g);
    expect(aLeft).toBe(0);
    expect(aWidth).toBeCloseTo((200 / 1200) * 100, 5);
    expect(bLeft).toBeCloseTo((200 / 1200) * 100, 5); // starts 200ms into a 1200ms span
    expect(bWidth).toBeCloseTo((1000 / 1200) * 100, 5);
  });

  it("left-aligns bars and clamps a minimum width in fallback mode", () => {
    const g = waterfallSpan([
      { name: "a", durationMs: 0 },
      { name: "b", durationMs: 100 },
    ]);
    const [aLeft, aWidth] = barGeom({ name: "a", durationMs: 0 }, g);
    expect(aLeft).toBe(0);
    expect(aWidth).toBeGreaterThan(0); // min-width clamp keeps zero bars visible
  });
});

describe("ToolWaterfall (component)", () => {
  const calls = [
    { name: "Read", start: 1000, end: 1200, durationMs: 200 },
    { name: "Bash", start: 1200, end: 2200, durationMs: 1000, isError: true },
    { name: "Edit", start: 2200, end: null, durationMs: null },
  ];

  it("renders a row per call with the tool name", () => {
    const { getByText } = render(<ToolWaterfall calls={calls} />);
    expect(getByText("Read")).toBeTruthy();
    expect(getByText("Bash")).toBeTruthy();
    expect(getByText("Edit")).toBeTruthy();
  });

  it("offsets bars along the timeline (not all left-aligned)", () => {
    const { container } = render(<ToolWaterfall calls={calls} />);
    const bars = container.querySelectorAll<HTMLElement>("[data-wf-bar]");
    expect(bars).toHaveLength(3);
    // Read starts at the origin; Bash starts later → non-zero left offset.
    expect(bars[0].style.left).toBe("0%");
    expect(bars[1].style.left).not.toBe("0%");
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
