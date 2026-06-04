import { describe, expect, test, vi } from "vitest";
vi.mock("@/db", () => ({ db: {} })); // find-stuck.ts (và ./list-agents) nhập @/db — stub cho jsdom
import { filterStuck } from "./find-stuck";
import type { AgentRow } from "./list-agents";

const now = Date.UTC(2026, 5, 4, 12, 0, 0);
const mk = (id: string, status: string, minAgo: number): AgentRow => ({
  id, projectId: null, machineId: null, model: null, status,
  startedAt: new Date(now - 60 * 60000), lastActivity: new Date(now - minAgo * 60000),
  latestActivity: null, tokensIn: 0, tokensOut: 0, costUsd: 0,
});

describe("filterStuck", () => {
  test("chỉ giữ phiên chưa done & quá ngưỡng", () => {
    const rows = [mk("a", "running", 20), mk("b", "running", 2), mk("c", "done", 99)];
    const out = filterStuck(rows, 10, now);
    expect(out.map((r) => r.id)).toEqual(["a"]);
  });
});
