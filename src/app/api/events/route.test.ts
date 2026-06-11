import { afterEach, describe, expect, test, vi } from "vitest";

// Hoisted mock state shared with the module mocks below (mirrors
// src/app/api/stats/route.test.ts). The query chain here is
// select().from().leftJoin().orderBy() so the leftJoin contributes projectName.
const h = vi.hoisted(() => ({
  authResult: null as { user?: { id: string } } | null,
  rows: [] as unknown[],
  selectCalls: 0,
  busCbs: [] as Array<(evt: { type: string }) => void>,
  busUnsubs: 0,
}));

vi.mock("@/auth", () => ({ auth: vi.fn(async () => h.authResult) }));
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => {
      h.selectCalls++;
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
// Capture bus callbacks so tests can fire publishes and count unsubscribes.
vi.mock("@/lib/events-bus", () => ({
  subscribe: vi.fn((cb: (evt: { type: string }) => void) => {
    h.busCbs.push(cb);
    return () => {
      h.busUnsubs++;
      h.busCbs = h.busCbs.filter((c) => c !== cb);
    };
  }),
}));

import { GET, clientCount, mapRowToLiveSession } from "./route";

afterEach(() => {
  h.authResult = null;
  h.rows = [];
  h.selectCalls = 0;
  h.busCbs = [];
  h.busUnsubs = 0;
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
      machineId: "local:devbox",
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
    // Machine attribution must survive the wire — the Agents machine filter
    // compares LiveSession.machineId against /api/machines ids (W6).
    expect(out.machineId).toBe("local:devbox");
  });

  test("null project → projectName null; null subAgents → null; missing status → done; null dates → null", () => {
    const out = mapRowToLiveSession({
      id: "b",
      projectId: null,
      projectName: null,
      machineId: null,
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

describe("GET /api/events — shared snapshot broadcast (perf M2)", () => {
  const row = {
    id: "s1",
    projectId: null,
    projectName: null,
    machineId: null,
    source: "claude",
    model: "claude",
    gitBranch: null,
    status: "running",
    startedAt: new Date(1000),
    lastActivity: new Date(5000),
    messageCount: 1,
    toolCount: 0,
    subAgentCount: 0,
    subAgents: null,
    costUsd: 0,
    latestActivity: null,
    tokensIn: 0,
    tokensOut: 0,
  };
  const dec = new TextDecoder();

  test("unauthenticated request → 401 and registers no client", async () => {
    h.authResult = null;
    const res = await GET();
    expect(res.status).toBe(401);
    expect(clientCount()).toBe(0);
  });

  test("one bus publish → ONE snapshot query, identical payload to every client", async () => {
    // The whole point of the registry: N connected dashboards must cost one
    // DB full-scan per bus event, not N — and all of them must converge on
    // the exact same `sessions` frame.
    h.authResult = { user: { id: "u1" } };
    h.rows = [row];

    const res1 = await GET();
    const res2 = await GET();
    const r1 = res1.body!.getReader();
    const r2 = res2.body!.getReader();

    // Drain the per-client initial snapshots (those stay per-connection).
    const init1 = dec.decode((await r1.read()).value);
    const init2 = dec.decode((await r2.read()).value);
    expect(init1).toContain("event: sessions");
    expect(init1).toBe(init2);
    expect(clientCount()).toBe(2);
    // ONE shared bus subscription for the whole route, not one per client.
    expect(h.busCbs).toHaveLength(1);

    const before = h.selectCalls;
    h.busCbs[0]({ type: "sync" });
    const [c1, c2] = await Promise.all([r1.read(), r2.read()]);
    expect(h.selectCalls).toBe(before + 1); // exactly one query for both clients
    const t1 = dec.decode(c1.value);
    const t2 = dec.decode(c2.value);
    expect(t1).toBe(t2); // same broadcast payload
    expect(t1).toContain("event: sessions");
    expect(t1).toContain('"type":"sessions"');
    expect(t1).toContain('"id":"s1"');

    await r1.cancel();
    await r2.cancel();
  });

  test("workflow events are forwarded under their own SSE name to all clients", async () => {
    // useLiveSessions / workflow UI rely on this exact wire format —
    // `event: workflow_run` followed by the raw event JSON.
    h.authResult = { user: { id: "u1" } };
    h.rows = [];

    const res = await GET();
    const r = res.body!.getReader();
    await r.read(); // initial snapshot

    h.busCbs[0]({ type: "workflow_run", runId: "wr1" } as { type: string });
    const chunk = dec.decode((await r.read()).value);
    expect(chunk).toContain("event: workflow_run");
    expect(chunk).toContain('"runId":"wr1"');

    await r.cancel();
  });

  test("a closed client leaves the registry; the last close releases the bus", async () => {
    // Disconnected dashboards must not keep costing broadcasts, and with no
    // clients left the route must not keep querying the DB on bus events.
    h.authResult = { user: { id: "u1" } };
    h.rows = [];

    const res1 = await GET();
    const res2 = await GET();
    const r1 = res1.body!.getReader();
    const r2 = res2.body!.getReader();
    await r1.read();
    await r2.read();
    expect(clientCount()).toBe(2);

    await r1.cancel();
    expect(clientCount()).toBe(1);
    expect(h.busUnsubs).toBe(0); // bus stays subscribed while a client remains

    await r2.cancel();
    expect(clientCount()).toBe(0);
    expect(h.busUnsubs).toBe(1); // last client out → bus subscription released
  });
});
