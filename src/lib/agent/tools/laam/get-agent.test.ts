import { describe, expect, test, vi } from "vitest";
vi.mock("@/db", () => ({ db: {} })); // get-agent.ts nhập @/db (pg Pool) — stub cho jsdom
import { shapeAgentDetail } from "./get-agent";

const now = Date.UTC(2026, 5, 4);
describe("shapeAgentDetail", () => {
  test("id không tồn tại (row undefined) → error có id (Rule 13)", () => {
    const r = shapeAgentDetail(undefined, now, "missing") as { error?: string };
    expect(r.error).toContain("missing");
  });
  test("có row → trả agent với tools/subAgents", () => {
    const row = {
      id: "s1", projectId: "p1", machineId: "m1", model: "qwen", status: "done",
      startedAt: new Date(now - 60000), lastActivity: new Date(now),
      latestActivity: null, tokensIn: 1, tokensOut: 2, costUsd: 0,
      tools: [{ name: "Edit", count: 3, errors: 0, avgDurationMs: null }],
      subAgents: [], histo: null,
    };
    const r = shapeAgentDetail(row, now, "s1") as { agent?: { id: string; tools: unknown[] } };
    expect(r.agent?.id).toBe("s1");
    expect(r.agent?.tools).toHaveLength(1);
  });
});
