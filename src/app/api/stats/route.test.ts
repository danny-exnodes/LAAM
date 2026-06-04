import { afterEach, describe, expect, test, vi } from "vitest";

// Hoisted mock state shared with the module mocks below.
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
          leftJoin: vi.fn(async () => h.rows),
        })),
      };
    }),
  },
}));

vi.mock("@/db/schema", () => ({ agentSessions: {}, projects: {} }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

import { GET } from "./route";

afterEach(() => {
  h.authResult = null;
  h.rows = [];
  h.selectCalled = false;
  vi.clearAllMocks();
});

describe("GET /api/stats", () => {
  test("401 when unauthenticated, and never queries the db", async () => {
    h.authResult = null;
    const res = await GET();
    expect(res.status).toBe(401);
    expect(h.selectCalled).toBe(false);
  });

  test("200 with computed stats when authenticated", async () => {
    h.authResult = { user: { id: "u1" } };
    h.rows = [
      {
        id: "a",
        status: "done",
        model: "claude",
        gitBranch: "main",
        project: "alpha",
        startedAt: new Date(1000),
        lastActivity: new Date(1000 + 3600 * 1000),
        messageCount: 3,
        toolCount: 2,
        subAgentCount: 0,
        tokensIn: 10,
        tokensOut: 5,
        costUsd: 0.5,
        tools: [{ name: "Bash", count: 2, errors: 0, avgDurationMs: 50 }],
        histo: { "0_9": 1 },
      },
    ];
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totals.sessions).toBe(1);
    expect(body.totals.tokensIn).toBe(10);
    expect(body.byModel).toEqual({ claude: 1 });
    expect(body.toolLeaderboard[0].name).toBe("Bash");
  });
});
