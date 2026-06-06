import { describe, expect, test, vi } from "vitest";
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/monitoring/parser.js", () => ({ getTimeline: () => [] }));
vi.mock("@/lib/monitoring/localParser.js", () => ({ getLocalTimeline: () => [] }));
import { shapeTimeline } from "./get-timeline";

describe("shapeTimeline", () => {
  test("keeps only the last N events and reports the true total", () => {
    const events = Array.from({ length: 50 }, (_, i) => ({ i }));
    const out = shapeTimeline(events, 25);
    expect(out.events).toHaveLength(25);
    expect(out.events[0]).toEqual({ i: 25 }); // tail, not head
    expect(out.total).toBe(50);
    expect(out.truncated).toBe(true);
  });

  test("a short timeline is kept whole and not flagged truncated", () => {
    const out = shapeTimeline([{ a: 1 }], 25);
    expect(out.events).toHaveLength(1);
    expect(out.total).toBe(1);
    expect(out.truncated).toBe(false);
  });
});
