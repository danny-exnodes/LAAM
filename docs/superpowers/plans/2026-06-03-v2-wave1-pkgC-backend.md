# V2 Wave 1 — Package W1-C (SSE enrich + bus publisher) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich the `/api/events` SSE snapshot with `projectName` (projects leftJoin) + `subAgents` (row jsonb), and make `/api/sync` publish to the events-bus so open SSE clients re-push after a sync.

**Architecture:** Factor the row→LiveSession mapping out of the `snapshot()` closure into a small exported pure fn (`mapRowToLiveSession`) so it is unit-testable without standing up the SSE stream. The route's `snapshot()` then does a `select().from(agentSessions).leftJoin(projects).orderBy(...)` and maps each row. `/api/sync` gains one `publish({type:"sync"})` call after a successful sync. SSE framing/auth and Date→epoch-ms normalization are unchanged (Rule 3 — surgical).

**Tech Stack:** Next.js 16 route handlers, Drizzle (`leftJoin`, `eq`), vitest (hoisted mocks, mirroring `src/app/api/stats/route.test.ts`).

---

## Shared Interfaces (LOCKED by TL)

```ts
// produced by /api/events snapshot, consumed by useLiveSessions (type locked):
// LiveSession now has projectName: string | null and subAgents: SubAgentJson[] | null
```

The enriched query selects `agentSessions` columns + `projects.name` and exposes both new fields.

---

## Task 1: Enrich the SSE snapshot (events/route.ts)

**Files:**
- Modify: `v2/src/app/api/events/route.ts`
- Test: `v2/src/app/api/events/route.test.ts` (create)

The select must explicitly choose columns so the projects leftJoin contributes only `projectName` (avoid column-name clash with the row). Mirror the stats route's `leftJoin` shape and `eq` from drizzle-orm.

- [ ] **Step 1: Write the failing test** for the exported pure mapper `mapRowToLiveSession`.

```ts
import { afterEach, describe, expect, test, vi } from "vitest";

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
      { id: "s1", type: "Explore", description: "scan", status: "done", durationMs: 1200 },
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd v2 && npx vitest run src/app/api/events`
Expected: FAIL — `mapRowToLiveSession` is not exported.

- [ ] **Step 3: Implement** — export `mapRowToLiveSession`, rewrite `snapshot()` to select explicit columns + leftJoin projects, map rows through it.

```ts
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { agentSessions, projects } from "@/db/schema";
import type { LiveSession } from "@/hooks/useLiveSessions";
import { subscribe } from "@/lib/events-bus";

// ...

// Shape of a joined row (agentSessions columns + the project's name).
type SnapshotRow = {
  id: string;
  projectId: string | null;
  projectName: string | null;
  source: string;
  model: string | null;
  gitBranch: string | null;
  status: string | null;
  startedAt: Date | null;
  lastActivity: Date | null;
  messageCount: number;
  toolCount: number;
  subAgentCount: number;
  subAgents: LiveSession["subAgents"];
  costUsd: number;
  latestActivity: string | null;
  tokensIn: number;
  tokensOut: number;
};

// Pure row → LiveSession mapper (Dates → epoch ms so isStuck compares numbers).
export function mapRowToLiveSession(s: SnapshotRow): LiveSession {
  return {
    id: s.id,
    projectId: s.projectId,
    projectName: s.projectName,
    source: s.source,
    model: s.model,
    gitBranch: s.gitBranch,
    status: s.status ?? "done",
    startedAt: s.startedAt ? s.startedAt.getTime() : null,
    lastActivity: s.lastActivity ? s.lastActivity.getTime() : null,
    messageCount: s.messageCount,
    toolCount: s.toolCount,
    subAgentCount: s.subAgentCount,
    subAgents: s.subAgents ?? null,
    costUsd: s.costUsd,
    latestActivity: s.latestActivity,
    tokensIn: s.tokensIn,
    tokensOut: s.tokensOut,
  };
}

async function snapshot(): Promise<LiveSession[]> {
  const rows = await db
    .select({
      id: agentSessions.id,
      projectId: agentSessions.projectId,
      projectName: projects.name,
      source: agentSessions.source,
      model: agentSessions.model,
      gitBranch: agentSessions.gitBranch,
      status: agentSessions.status,
      startedAt: agentSessions.startedAt,
      lastActivity: agentSessions.lastActivity,
      messageCount: agentSessions.messageCount,
      toolCount: agentSessions.toolCount,
      subAgentCount: agentSessions.subAgentCount,
      subAgents: agentSessions.subAgents,
      costUsd: agentSessions.costUsd,
      latestActivity: agentSessions.latestActivity,
      tokensIn: agentSessions.tokensIn,
      tokensOut: agentSessions.tokensOut,
    })
    .from(agentSessions)
    .leftJoin(projects, eq(agentSessions.projectId, projects.id))
    .orderBy(desc(agentSessions.lastActivity));
  return rows.map(mapRowToLiveSession);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd v2 && npx vitest run src/app/api/events`
Expected: PASS.

---

## Task 2: Publish on sync (sync/route.ts)

**Files:**
- Modify: `v2/src/app/api/sync/route.ts`
- Test: `v2/src/app/api/sync/route.test.ts` (create)

- [ ] **Step 1: Write the failing test.**

```ts
import { afterEach, describe, expect, test, vi } from "vitest";

const h = vi.hoisted(() => ({
  authResult: null as { user?: { id: string } } | null,
  syncResult: { added: 0 } as unknown,
  syncThrows: false,
}));

vi.mock("@/auth", () => ({ auth: vi.fn(async () => h.authResult) }));
vi.mock("@/lib/sync", () => ({
  syncLocalMonitoring: vi.fn(async () => {
    if (h.syncThrows) throw new Error("boom");
    return h.syncResult;
  }),
}));
const publish = vi.fn();
vi.mock("@/lib/events-bus", () => ({ publish }));

import { POST } from "./route";
import { syncLocalMonitoring } from "@/lib/sync";

afterEach(() => {
  h.authResult = null;
  h.syncThrows = false;
  vi.clearAllMocks();
});

describe("POST /api/sync", () => {
  test("401 unauthenticated — no sync, no publish", async () => {
    h.authResult = null;
    const res = await POST();
    expect(res.status).toBe(401);
    expect(syncLocalMonitoring).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  test("publishes a sync event after a successful sync and returns the result", async () => {
    h.authResult = { user: { id: "u1" } };
    h.syncResult = { added: 3 };
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ added: 3 });
    expect(publish).toHaveBeenCalledWith({ type: "sync" });
  });

  test("does NOT publish when sync fails", async () => {
    h.authResult = { user: { id: "u1" } };
    h.syncThrows = true;
    const res = await POST();
    expect(res.status).toBe(500);
    expect(publish).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd v2 && npx vitest run src/app/api/sync`
Expected: FAIL — publish not called.

- [ ] **Step 3: Implement** — import `publish`, call it after a successful sync, before returning.

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { publish } from "@/lib/events-bus";
import { syncLocalMonitoring } from "@/lib/sync";

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await syncLocalMonitoring();
    // Fan the change out to open SSE clients so /agents refreshes live.
    publish({ type: "sync" });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "sync failed" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd v2 && npx vitest run src/app/api/sync src/app/api/events`
Expected: PASS (both suites).

---

## Self-review notes
- Spec coverage: enrich snapshot (projectName leftJoin + subAgents passthrough, epoch-ms kept) ✓; publish after sync, result unchanged ✓; tests for both ✓.
- Hard constraints honored: only events/route.ts + sync/route.ts (+ their tests) touched; SSE framing/auth untouched; publish only on success.
- Type consistency: `mapRowToLiveSession` returns the LOCKED `LiveSession` type imported from the hook.
