import { describe, it, expect } from "vitest";
import { mapCostByDay } from "./CostByDay";
import { mapTokensByDay } from "./TokensByDay";
import type { Stats } from "@/lib/stats.types";

const HOUR = 3_600_000;
const DAY = 86_400_000;
const t0 = Date.UTC(2026, 0, 2, 0, 0, 0);

const pt = (t: number, over: Partial<Stats["activity"][number]> = {}): Stats["activity"][number] => ({
  t,
  sessions: 1,
  tokens: 0,
  tokensIn: 0,
  tokensOut: 0,
  cost: 0,
  ...over,
});

describe("mapCostByDay", () => {
  it("returns [] for empty input", () => {
    expect(mapCostByDay([])).toEqual([]);
  });

  it("rounds cost to cents and keeps order", () => {
    const r = mapCostByDay([pt(t0, { cost: 1.239 }), pt(t0 + HOUR, { cost: 0.5 })]);
    expect(r.map((x) => x.cost)).toEqual([1.24, 0.5]);
  });

  it("uses hourly labels (<1 day apart) and daily labels (>=1 day apart)", () => {
    expect(mapCostByDay([pt(t0), pt(t0 + HOUR)])[0].label).toMatch(/h$/);
    expect(mapCostByDay([pt(t0), pt(t0 + DAY)])[0].label).toContain("/");
  });
});

describe("mapTokensByDay", () => {
  it("splits in/out per bucket", () => {
    const r = mapTokensByDay([pt(t0, { tokensIn: 10, tokensOut: 4 })]);
    expect(r[0]).toMatchObject({ tokensIn: 10, tokensOut: 4 });
  });
});
