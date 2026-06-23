import { describe, test, expect } from "vitest";
import { formatMetricsDigest, type SessionLite } from "./metrics-digest";
import type { Stats } from "@/lib/stats.types";

const NOW = Date.UTC(2026, 5, 23, 8, 0, 0); // deterministic

function mkStats(over: Partial<Stats["totals"]>): Stats {
  const totals = {
    sessions: 0, running: 0, idle: 0, done: 0, messages: 0, toolCalls: 0,
    subAgents: 0, tokensIn: 0, tokensOut: 0, costUsd: 0, avgDurationMs: 0, ...over,
  };
  return { totals } as unknown as Stats;
}

describe("formatMetricsDigest — ground-truth block (Rule 13)", () => {
  test("formats totals with thousands separators + ISO timestamp", () => {
    const s = mkStats({ sessions: 82, running: 3, idle: 5, done: 74, tokensIn: 717000, tokensOut: 483210, costUsd: 12.5 });
    const out = formatMetricsDigest(s, [], [], NOW, 10);
    expect(out).toContain("2026-06-23T08:00:00.000Z");
    expect(out).toContain("82 tổng — 3 đang chạy · 5 idle · 74 xong");
    expect(out).toContain("717,000 vào · 483,210 ra (tổng 1,200,210)");
    expect(out).toContain("$12.50");
    expect(out).toContain("Phiên kẹt (≥10′): 0");
    expect(out).not.toContain("kẹt:"); // no stuck sub-lines when none
  });

  test("lists up to 3 stuck sessions + top burners", () => {
    const stuck: SessionLite[] = [
      { id: "a1", project: "web", tokens: 50000 },
      { id: "a2", project: null, tokens: 9000 },
      { id: "a3", project: "api", tokens: 100 },
      { id: "a4", project: "x", tokens: 1 },
    ];
    const burners: SessionLite[] = [{ id: "a1", project: "web", tokens: 50000 }];
    const out = formatMetricsDigest(mkStats({ sessions: 4 }), stuck, burners, NOW, 15);
    expect(out).toContain("Phiên kẹt (≥15′): 4");
    expect(out).toContain("kẹt: a1 (web) — 50,000 token");
    expect(out).toContain("kẹt: a2 — 9,000 token"); // null project → no parens
    expect(out.match(/kẹt:/g)?.length).toBe(3); // capped at 3
    expect(out).toContain("Top đốt token: a1 (web) 50,000");
  });
});
