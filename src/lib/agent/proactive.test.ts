import { describe, expect, test } from "vitest";
import { detectAlerts, selectNewAlerts, formatProactiveNotice } from "./proactive";
import type { SessionRow } from "@/lib/stats.types";

const now = Date.UTC(2026, 5, 5, 12, 0, 0);
const row = (over: Partial<SessionRow>): SessionRow => ({
  id: "s1", status: "running", model: "qwen", gitBranch: "main", project: "LAAM",
  startedAt: now - 60 * 60000, lastActivity: now - 60000, messageCount: 0, toolCount: 0,
  subAgentCount: 0, tokensIn: 0, tokensOut: 0, costUsd: 0, tools: null, histo: null, ...over,
});

describe("detectAlerts", () => {
  test("stuck khi chưa done & quá ngưỡng 10'", () => {
    const a = detectAlerts([row({ lastActivity: now - 20 * 60000 })], now);
    expect(a.find((x) => x.type === "stuck")?.key).toBe("stuck:s1");
  });
  test("done → không stuck, không cost", () => {
    const a = detectAlerts([row({ status: "done", lastActivity: now - 60 * 60000, costUsd: 5 })], now);
    expect(a).toEqual([]);
  });
  test("cost-alert theo ngưỡng tuyệt đối", () => {
    const a = detectAlerts([row({ costUsd: 1.5 })], now, { stuckMin: 999 });
    expect(a.find((x) => x.type === "cost")?.costUsd).toBe(1.5);
  });
  test("cost-alert theo burn-rate", () => {
    const a = detectAlerts([row({ costUsd: 0.5, startedAt: now - 60000, lastActivity: now })], now, {
      stuckMin: 999, costUsd: 999, burnUsdPerMin: 0.1,
    });
    expect(a.some((x) => x.type === "cost")).toBe(true);
  });
});

describe("selectNewAlerts", () => {
  const alerts = [{ type: "stuck" as const, key: "stuck:s1", sessionId: "s1", project: "LAAM", minutesIdle: 20 }];
  test("key mới → surface + ghi state", () => {
    const r = selectNewAlerts(alerts, null, now);
    expect(r.toSurface).toHaveLength(1);
    expect(r.newState.surfaced["stuck:s1"]).toBe(now);
  });
  test("key vừa nêu trong cooldown → không lặp", () => {
    const r = selectNewAlerts(alerts, { surfaced: { "stuck:s1": now - 1000 } }, now, 6 * 3600 * 1000);
    expect(r.toSurface).toEqual([]);
  });
  test("key quá cooldown → nêu lại", () => {
    const r = selectNewAlerts(alerts, { surfaced: { "stuck:s1": now - 7 * 3600 * 1000 } }, now, 6 * 3600 * 1000);
    expect(r.toSurface).toHaveLength(1);
  });
});

describe("formatProactiveNotice", () => {
  test("rỗng → ''", () => {
    expect(formatProactiveNotice([], "vi")).toBe("");
  });
  test("vi: có stuck + cost, format $", () => {
    const s = formatProactiveNotice(
      [
        { type: "stuck", key: "stuck:s1", sessionId: "s1", project: "LAAM", minutesIdle: 20 },
        { type: "cost", key: "cost:s2", sessionId: "s2", project: "API", costUsd: 1.3 },
      ],
      "vi",
    );
    expect(s).toContain("kẹt");
    expect(s).toContain("LAAM");
    expect(s).toContain("$1.30");
  });
  test("en/zh không lỗi", () => {
    const a = [{ type: "stuck" as const, key: "k", sessionId: "s", project: null, minutesIdle: 5 }];
    expect(formatProactiveNotice(a, "en")).toContain("stuck");
    expect(formatProactiveNotice(a, "zh")).toContain("agent");
  });
});
