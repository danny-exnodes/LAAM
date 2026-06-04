import { afterEach, describe, expect, test, vi } from "vitest";

// Hoisted mock state shared with the module mocks below (mirrors
// src/app/api/stats/route.test.ts). The query chain here is
// select().from().leftJoin().orderBy() so the leftJoin contributes projectName.
const h = vi.hoisted(() => ({
  authResult: null as { user?: { id: string } } | null,
  rows: [] as unknown[],
  selectCalled: false,
}));

vi.mock("@/auth", () => ({ auth: vi.fn(async () => h.authResult) }));
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => {
      h.selectCalled = true;
      return {
        from: vi.fn(() => ({
          leftJoin: vi.fn(() => ({
            orderBy: vi.fn(async () => h.rows),
          })),
        })),
      };
    }),
  },
}));
vi.mock("@/db/schema", () => ({ agentSessions: {}, projects: {} }));
vi.mock("drizzle-orm", () => ({ desc: vi.fn(), eq: vi.fn() }));
vi.mock("@/lib/events-bus", () => ({ subscribe: vi.fn(() => () => {}) }));

import { mapRowToLiveSession } from "./route";

afterEach(() => {
  h.authResult = null;
  h.rows = [];
  h.selectCalled = false;
  vi.clearAllMocks();
});

describe("mapRowToLiveSession", () => {
  test("populates projectName and subAgents, normalizes Dates to epoch ms", () => {
    const subAgents = [
      {
        id: "s1",
        type: "Explore",
        description: "scan",
        status: "done",
        durationMs: 1200,
      },
    ];
    const out = mapRowToLiveSession({
      id: "a",
      projectId: "proj:x",
      projectName: "alpha",
      source: "claude",
      model: "claude",
      gitBranch: "main",
      status: "running",
      startedAt: new Date(1000),
      lastActivity: new Date(5000),
      messageCount: 3,
      toolCount: 2,
      subAgentCount: 1,
      subAgents,
      costUsd: 0.5,
      latestActivity: "editing file",
      tokensIn: 10,
      tokensOut: 5,
    });
    expect(out.projectName).toBe("alpha");
    expect(out.subAgents).toEqual(subAgents);
    expect(out.startedAt).toBe(1000);
    expect(out.lastActivity).toBe(5000);
    expect(out.status).toBe("running");
  });

  test("null project → projectName null; null subAgents → null; missing status → done; null dates → null", () => {
    const out = mapRowToLiveSession({
      id: "b",
      projectId: null,
      projectName: null,
      source: "local",
      model: null,
      gitBranch: null,
      status: null,
      startedAt: null,
      lastActivity: null,
      messageCount: 0,
      toolCount: 0,
      subAgentCount: 0,
      subAgents: null,
      costUsd: 0,
      latestActivity: null,
      tokensIn: 0,
      tokensOut: 0,
    });
    expect(out.projectName).toBeNull();
    expect(out.subAgents).toBeNull();
    expect(out.status).toBe("done");
    expect(out.startedAt).toBeNull();
    expect(out.lastActivity).toBeNull();
  });
});
