import { describe, expect, test, vi, beforeEach } from "vitest";

// Capture the where() clause + whether the db was touched, so we can assert the
// principal-scope (a token reads only its OWN actor rows; orphan → no query).
let capturedWhere: unknown;
let selectCalled = false;
let auditRows: unknown[] = [];

vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ _eq: [a, b] }),
  and: (...xs: unknown[]) => ({ _and: xs }),
  desc: (a: unknown) => ({ _desc: a }),
}));
vi.mock("@/db/schema", () => ({
  auditLog: { userId: "al.userId", action: "al.action", target: "al.target", createdAt: "al.createdAt" },
}));
vi.mock("@/db", () => ({
  db: {
    select: () => {
      selectCalled = true;
      return {
        from: () => ({
          where: (w: unknown) => {
            capturedWhere = w;
            return { orderBy: () => ({ limit: async () => auditRows }) };
          },
        }),
      };
    },
  },
}));

import { shapeAudit, queryAudit, type AuditRow } from "./query-audit";

const now = Date.UTC(2026, 5, 6);
const ctx = (userId: string) => ({ userId, now: 0, lang: "vi" as const });

beforeEach(() => {
  capturedWhere = undefined;
  selectCalled = false;
  auditRows = [];
});

describe("shapeAudit", () => {
  test("maps action/target/createdAt to a compact entry with ISO time", () => {
    const rows: AuditRow[] = [{ action: "connector.write", target: "trello:card", createdAt: new Date(now) }];
    const out = shapeAudit(rows);
    expect(out[0].action).toBe("connector.write");
    expect(out[0].target).toBe("trello:card");
    expect(out[0].at).toBe(new Date(now).toISOString());
  });

  test("tolerates null target / createdAt", () => {
    const out = shapeAudit([{ action: "x", target: null, createdAt: null }]);
    expect(out[0].target).toBeNull();
    expect(out[0].at).toBeNull();
  });
});

describe("queryAudit.handler — principal scoping", () => {
  test("scopes the query to the caller's own actor rows (eq auditLog.userId, principal)", async () => {
    auditRows = [{ action: "connector.write", target: "trello:card", createdAt: new Date(now) }];
    const out = (await queryAudit.handler({}, ctx("u1"))) as { entries: unknown[] };
    expect(out.entries).toHaveLength(1);
    // the where is and(eq(userId, principal), <action filter | undefined>)
    const conds = (capturedWhere as { _and: unknown[] })._and;
    expect(conds).toContainEqual({ _eq: ["al.userId", "u1"] });
  });

  test("an empty principal (orphaned token whose owner was deleted) → no rows, NO db query", async () => {
    const out = (await queryAudit.handler({}, ctx(""))) as { entries: unknown[] };
    expect(out.entries).toEqual([]);
    expect(selectCalled).toBe(false); // fail-closed: never falls back to org-wide
  });

  test("action filter is combined WITH the principal scope (not instead of it)", async () => {
    await queryAudit.handler({ action: "role_change" }, ctx("u1"));
    const conds = (capturedWhere as { _and: unknown[] })._and;
    expect(conds).toContainEqual({ _eq: ["al.userId", "u1"] }); // principal scope always present
    expect(conds).toContainEqual({ _eq: ["al.action", "role_change"] }); // plus the optional action filter
  });
});
