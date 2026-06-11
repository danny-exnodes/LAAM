import { describe, expect, test } from "vitest";
import { and, eq, ilike, or } from "drizzle-orm";
import { agentSessions, chatConversations, projects, workflows } from "@/db/schema";
import { escapeLike, searchAll, type Db } from "./search";

// Chainable fake: select() #1 → sessions, #2 → conversations, #3 → workflows
// (the order searchAll issues them). Captures each query's where-condition and
// limit so tests can assert scoping + caps without a live Postgres.
function fakeDb(rows: { sessions?: unknown[]; conversations?: unknown[]; workflows?: unknown[] }) {
  const queue = [rows.sessions ?? [], rows.conversations ?? [], rows.workflows ?? []];
  const calls: { where: unknown; limit: number }[] = [];
  let i = 0;
  const db = {
    select() {
      const result = queue[i++] ?? [];
      const call = { where: undefined as unknown, limit: 0 };
      calls.push(call);
      const b = {
        from: () => b,
        leftJoin: () => b,
        where: (c: unknown) => {
          call.where = c;
          return b;
        },
        orderBy: () => b,
        limit: async (n: number) => {
          call.limit = n;
          return result;
        },
      };
      return b;
    },
  };
  return { db: db as unknown as Db, calls };
}

const throwingDb = new Proxy(
  {},
  {
    get() {
      throw new Error("DB must not be touched for a sub-minimum query");
    },
  },
) as Db;

describe("escapeLike", () => {
  test("escapes %, _ and \\ so user input matches literally, leaves the rest alone", () => {
    expect(escapeLike("100%_done\\x")).toBe("100\\%\\_done\\\\x");
    expect(escapeLike("plain query")).toBe("plain query");
  });
});

describe("searchAll", () => {
  test("query shorter than 2 chars (after trim) returns empty groups WITHOUT hitting the DB", async () => {
    // Guards both UX (no noise results) and load (no seq-scan per keystroke).
    for (const q of ["", " ", "a", " a "]) {
      expect(await searchAll(throwingDb, q, "u1")).toEqual({
        sessions: [],
        conversations: [],
        workflows: [],
      });
    }
  });

  test("conversations and workflows are scoped to the caller; sessions stay org-shared", async () => {
    // Private data (chat, workflows) must never leak across users; agent
    // sessions are org-shared by decision (same visibility as /api/events).
    const { db, calls } = fakeDb({});
    await searchAll(db, "deploy", "u1");
    const pattern = "%deploy%";
    expect(calls[0].where).toStrictEqual(
      or(
        ilike(agentSessions.latestActivity, pattern),
        ilike(projects.name, pattern),
        ilike(agentSessions.gitBranch, pattern),
      ),
    );
    expect(calls[1].where).toStrictEqual(
      and(eq(chatConversations.userId, "u1"), ilike(chatConversations.title, pattern)),
    );
    expect(calls[2].where).toStrictEqual(
      and(eq(workflows.userId, "u1"), ilike(workflows.name, pattern)),
    );
  });

  test("wildcards in the query are escaped before reaching ILIKE", async () => {
    // "%_" unescaped would match EVERY row — turning search into a data dump.
    const { db, calls } = fakeDb({});
    await searchAll(db, "50%_a", "u1");
    expect(calls[1].where).toStrictEqual(
      and(eq(chatConversations.userId, "u1"), ilike(chatConversations.title, "%50\\%\\_a%")),
    );
  });

  test("each group is capped at 20 rows (SQL LIMIT, not post-filter)", async () => {
    const { db, calls } = fakeDb({});
    await searchAll(db, "abc", "u1");
    expect(calls.map((c) => c.limit)).toEqual([20, 20, 20]);
  });

  test("shapes rows: Dates → ISO strings, nulls preserved", async () => {
    const at = new Date("2026-06-11T08:00:00.000Z");
    const { db } = fakeDb({
      sessions: [
        {
          id: "s1",
          projectName: "LAAM",
          status: "running",
          latestActivity: "đang sửa bug auth",
          lastActivity: at,
        },
        { id: "s2", projectName: null, status: null, latestActivity: null, lastActivity: null },
      ],
      conversations: [{ id: "c1", title: "Hỏi về deploy", updatedAt: at }],
      workflows: [{ id: "w1", name: "Daily digest", status: "active", updatedAt: null }],
    });
    const out = await searchAll(db, "abc", "u1");
    expect(out.sessions[0]).toEqual({
      id: "s1",
      projectName: "LAAM",
      status: "running",
      latestActivity: "đang sửa bug auth",
      lastActivity: at.toISOString(),
    });
    expect(out.sessions[1].lastActivity).toBeNull();
    expect(out.conversations).toEqual([
      { id: "c1", title: "Hỏi về deploy", updatedAt: at.toISOString() },
    ]);
    expect(out.workflows).toEqual([
      { id: "w1", name: "Daily digest", status: "active", updatedAt: null },
    ]);
  });
});
