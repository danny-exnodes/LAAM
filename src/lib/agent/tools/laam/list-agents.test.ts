import { describe, expect, test, vi } from "vitest";
vi.mock("@/db", () => ({ db: {} })); // module nhập @/db (pg Pool) — stub cho jsdom
import { shapeAgents, type AgentRow } from "./list-agents";

const now = Date.UTC(2026, 5, 4, 12, 0, 0);
const base: AgentRow = {
  id: "s1", projectId: "p1", machineId: "m1", model: "qwen", status: "running",
  startedAt: new Date(now - 30 * 60000), lastActivity: new Date(now - 1 * 60000),
  latestActivity: "Editing file", tokensIn: 100, tokensOut: 50, costUsd: 0.1,
};

describe("shapeAgents", () => {
  test("tính durationMin + stuck=false khi mới hoạt động", () => {
    const [a] = shapeAgents([base], now);
    expect(a.durationMin).toBe(29);
    expect(a.stuck).toBe(false);
    expect(a.latestActivity).toBe("Editing file");
  });
  test("stuck=true khi quá ngưỡng 10' và chưa done", () => {
    const old = { ...base, lastActivity: new Date(now - 20 * 60000) };
    expect(shapeAgents([old], now)[0].stuck).toBe(true);
  });
  test("done → không stuck", () => {
    const done = { ...base, status: "done", lastActivity: new Date(now - 60 * 60000) };
    expect(shapeAgents([done], now)[0].stuck).toBe(false);
  });
});
