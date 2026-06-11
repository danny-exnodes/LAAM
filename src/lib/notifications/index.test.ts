import { afterEach, describe, expect, test, vi } from "vitest";

// The lib is the SINGLE write chokepoint: create() inserts (dedupe-aware) then
// publishes a per-user SSE event on the events-bus. Tests mock the db query chain
// and the bus so we assert BOTH the persisted shape and the published event.

const h = vi.hoisted(() => ({
  // create(): insert(...).values(...).onConflictDoUpdate(...).returning() → rows
  insertedValues: undefined as Record<string, unknown> | undefined,
  conflictArg: undefined as unknown,
  returnRows: [] as Record<string, unknown>[],
  // listForUser / unreadCount / markRead / pruneOld capture
  whereArgs: [] as unknown[],
  selectRows: [] as Record<string, unknown>[],
  updatePatch: undefined as unknown,
  // published bus events
  published: [] as { type: string; [k: string]: unknown }[],
}));

vi.mock("@/lib/events-bus", () => ({
  publish: vi.fn((e: { type: string }) => h.published.push(e)),
}));

vi.mock("@/db/schema", () => ({
  notifications: {
    id: "n.id",
    userId: "n.userId",
    readAt: "n.readAt",
    dedupeKey: "n.dedupeKey",
    createdAt: "n.createdAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => ({ _and: a }),
  eq: (a: unknown, b: unknown) => ({ _eq: [a, b] }),
  desc: (a: unknown) => ({ _desc: a }),
  isNull: (a: unknown) => ({ _isNull: a }),
  lt: (a: unknown, b: unknown) => ({ _lt: [a, b] }),
  count: () => ({ _count: true }),
  sql: (strings: TemplateStringsArray, ...v: unknown[]) => ({ _sql: strings.join("?"), _v: v }),
}));

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn((v: Record<string, unknown>) => {
        h.insertedValues = v;
        return {
          onConflictDoUpdate: vi.fn((arg: unknown) => {
            h.conflictArg = arg;
            return { returning: vi.fn(async () => h.returnRows) };
          }),
        };
      }),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn((w: unknown) => {
          h.whereArgs.push(w);
          // .where() is a thenable in Drizzle (awaitable directly, as unreadCount
          // does) AND chainable (.orderBy().limit(), as listForUser does).
          return {
            orderBy: vi.fn(() => ({ limit: vi.fn(async () => h.selectRows) })),
            limit: vi.fn(async () => h.selectRows),
            then: (resolve: (v: unknown) => void) => resolve(h.selectRows),
          };
        }),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((p: unknown) => {
        h.updatePatch = p;
        return { where: vi.fn(async (w: unknown) => { h.whereArgs.push(w); }) };
      }),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(async (w: unknown) => { h.whereArgs.push(w); }),
    })),
  },
}));

import { create, listForUser, markRead, unreadCount, pruneOld } from "./index";

afterEach(() => {
  h.insertedValues = undefined;
  h.conflictArg = undefined;
  h.returnRows = [];
  h.whereArgs = [];
  h.selectRows = [];
  h.updatePatch = undefined;
  h.published = [];
  vi.clearAllMocks();
});

describe("create() — insert + publish chokepoint", () => {
  test("persists the notification and publishes a per-user SSE event with userId", async () => {
    h.returnRows = [
      {
        id: "n1",
        userId: "userA",
        type: "workflow_run",
        severity: "error",
        title: "Workflow failed",
        body: null,
        link: "/workflows/wf1?run=r1",
        source: "workflow",
        readAt: null,
        dedupeKey: "wfrun:r1",
        createdAt: new Date(1000),
      },
    ];
    const n = await create({
      userId: "userA",
      type: "workflow_run",
      severity: "error",
      title: "Workflow failed",
      link: "/workflows/wf1?run=r1",
      source: "workflow",
      dedupeKey: "wfrun:r1",
    });

    // Persisted shape carries the recipient + severity + link.
    expect(h.insertedValues).toMatchObject({
      userId: "userA",
      type: "workflow_run",
      severity: "error",
      title: "Workflow failed",
      link: "/workflows/wf1?run=r1",
      source: "workflow",
      dedupeKey: "wfrun:r1",
    });

    // CRITICAL: the published event is the per-user notification channel — it MUST
    // carry the recipient userId so the SSE route fans it ONLY to that user.
    expect(h.published).toHaveLength(1);
    expect(h.published[0]).toMatchObject({ type: "notification", userId: "userA" });
    expect((h.published[0] as unknown as { notification: { id: string } }).notification.id).toBe("n1");
    expect(n.id).toBe("n1");
  });

  test("dedupe: an upsert on dedupeKey conflict is requested (do-nothing/touch, not a 2nd row)", async () => {
    h.returnRows = [{ id: "n1", userId: "userA", dedupeKey: "wfrun:r1", readAt: null, createdAt: new Date() }];
    await create({
      userId: "userA",
      type: "workflow_run",
      severity: "info",
      title: "ok",
      source: "workflow",
      dedupeKey: "wfrun:r1",
    });
    // onConflictDoUpdate was wired (the partial-unique index collapses repeats).
    expect(h.conflictArg).toBeDefined();
  });

  test("no dedupeKey → plain insert still publishes", async () => {
    h.returnRows = [{ id: "n2", userId: "userB", readAt: null, createdAt: new Date() }];
    await create({ userId: "userB", type: "system", severity: "info", title: "hi", source: "system" });
    expect(h.published).toHaveLength(1);
    expect(h.published[0]).toMatchObject({ type: "notification", userId: "userB" });
  });
});

describe("listForUser / unreadCount / markRead / pruneOld", () => {
  test("listForUser scopes the query to the user", async () => {
    h.selectRows = [{ id: "n1", userId: "userA" }];
    const rows = await listForUser("userA", { limit: 20 });
    expect(rows).toEqual([{ id: "n1", userId: "userA" }]);
    // The where clause references the userId column + the caller's id.
    const w = JSON.stringify(h.whereArgs);
    expect(w).toContain("userA");
    expect(w).toContain("n.userId");
  });

  test("unreadCount filters userId AND readAt is null", async () => {
    h.selectRows = [{ n: 3 }];
    const c = await unreadCount("userA");
    expect(c).toBe(3);
    const w = JSON.stringify(h.whereArgs);
    expect(w).toContain("n.readAt"); // unread = readAt IS NULL
    expect(w).toContain("userA");
  });

  test("markRead(userId, id) sets readAt scoped to the owner", async () => {
    await markRead("userA", "n1");
    expect(h.updatePatch).toMatchObject({ readAt: expect.any(Date) });
    const w = JSON.stringify(h.whereArgs);
    expect(w).toContain("userA"); // can't mark another user's notification read
    expect(w).toContain("n1");
  });

  test("markRead(userId, 'all') marks every unread for the user", async () => {
    await markRead("userA", "all");
    expect(h.updatePatch).toMatchObject({ readAt: expect.any(Date) });
    const w = JSON.stringify(h.whereArgs);
    expect(w).toContain("userA");
    expect(w).toContain("n.readAt"); // only the still-unread rows
  });

  test("pruneOld(days) deletes rows older than the cutoff", async () => {
    await pruneOld(30);
    const w = JSON.stringify(h.whereArgs);
    expect(w).toContain("n.createdAt");
  });
});
