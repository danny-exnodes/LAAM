import { describe, expect, test, vi } from "vitest";
vi.mock("@/db", () => ({ db: {} })); // query-stats.ts nhập @/db (pg Pool) — stub cho jsdom
import { shapeStatsSummary } from "./query-stats";
import { computeStats } from "@/lib/stats";
import type { SessionRow } from "@/lib/stats.types";

const rows: SessionRow[] = [
  {
    id: "s1", status: "running", model: "qwen", gitBranch: "main", project: "LAAM",
    startedAt: 1000, lastActivity: 61000, messageCount: 3, toolCount: 2, subAgentCount: 0,
    tokensIn: 100, tokensOut: 50, costUsd: 0.2, tools: null, histo: null,
  },
];

describe("shapeStatsSummary", () => {
  test("trả totals + byModel + topProjects/topTools (compact)", () => {
    const s = shapeStatsSummary(computeStats(rows));
    expect(s.totals.sessions).toBe(1);
    expect(s.byModel.qwen).toBe(1);
    expect(Array.isArray(s.topProjects)).toBe(true);
    expect(Array.isArray(s.topTools)).toBe(true);
  });
});
