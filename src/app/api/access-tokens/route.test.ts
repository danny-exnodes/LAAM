import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/access-token", () => ({
  generateAccessToken: () => "laam_personaltoken5678",
  formatTokenDisplay: (t: string) => ({ prefix: t.slice(0, 9), last4: t.slice(-4) }),
  hashToken: (t: string) => `hash:${t}`,
}));
import { auth } from "@/auth";
const mockAuth = vi.mocked(auth);

// Stable column identifiers so the captured drizzle `eq()` args are inspectable.
vi.mock("@/db/schema", () => ({
  accessTokens: { __t: "access_token", userId: "at.userId", createdAt: "at.createdAt" },
  users: { __t: "user", id: "u.id", role: "u.role", disabledAt: "u.disabledAt" },
  auditLog: { __t: "audit_log" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ _eq: [a, b] }),
  and: (...a: unknown[]) => ({ _and: a }),
  desc: (a: unknown) => ({ _desc: a }),
}));

// Mutable fixtures, reset per test.
let selectRows: Record<string, unknown>[] = []; // accessTokens list (GET)
let targetUser: Record<string, unknown> | undefined; // users lookup (POST provisioning)
let lastProjection: Record<string, unknown> | undefined; // captured GET projection
const whereArgs: unknown[] = []; // captured where() clauses
const inserts: Record<string, unknown>[] = []; // accessTokens inserts
const audits: Record<string, unknown>[] = []; // auditLog inserts
let auditFails = false; // simulate audit-insert failure inside the tx

function insertFor(table: { __t: string }) {
  return {
    values: (v: Record<string, unknown>) => {
      if (table.__t === "audit_log") {
        audits.push(v);
        if (auditFails) throw new Error("audit insert failed");
        return { returning: async () => [{ id: "audit" }] };
      }
      inserts.push(v);
      return { returning: async () => [{ id: "newtoken" }] };
    },
  };
}

vi.mock("@/db", () => ({
  db: {
    select: (proj?: Record<string, unknown>) => {
      lastProjection = proj;
      return {
        from: () => ({
          where: (w: unknown) => {
            whereArgs.push(w);
            return {
              orderBy: async () => selectRows,
              limit: async () => (targetUser === undefined ? [] : [targetUser]),
            };
          },
        }),
      };
    },
    insert: (table: { __t: string }) => insertFor(table),
    transaction: async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({ insert: (table: { __t: string }) => insertFor(table) }),
  },
}));

import { GET, POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  selectRows = [];
  targetUser = undefined;
  lastProjection = undefined;
  whereArgs.length = 0;
  inserts.length = 0;
  audits.length = 0;
  auditFails = false;
});

describe("POST /api/access-tokens — self-service (unchanged surface)", () => {
  test("401 unauth", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await post({ name: "k", kind: "mcp" })).status).toBe(401);
  });

  test("viewer → 403, no token issued (read-only cannot mint)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "viewer" } } as never);
    const res = await post({ name: "k", kind: "mcp" });
    expect(res.status).toBe(403);
    expect(inserts).toHaveLength(0);
  });

  test("viewer with forUserId == self → 403 via mutator gate (not the privileged branch)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "viewer" } } as never);
    const res = await post({ name: "k", kind: "mcp", forUserId: "u1" });
    expect(res.status).toBe(403);
    expect(inserts).toHaveLength(0);
  });

  test("400 for a non api/mcp kind (collector not issuable here)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const res = await post({ name: "k", kind: "collector" });
    expect(res.status).toBe(400);
    expect(inserts).toHaveLength(0);
  });

  test("creates mcp token for caller (userId=self, createdByUserId=null, scopes read, no-store)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const res = await post({ name: "ext agent", kind: "mcp" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store"); // secret never cached
    const body = await res.json();
    expect(body.token).toBe("laam_personaltoken5678");
    const v = inserts[0];
    expect(v.kind).toBe("mcp");
    expect(v.userId).toBe("u1");
    expect(v.createdByUserId).toBe(null);
    expect(v.scopes).toEqual(["read"]);
    expect(audits).toHaveLength(0); // self-service is not audited
  });
});

describe("POST /api/access-tokens — provisioning for another user", () => {
  test("member with forUserId != self → 403, no insert (only owner/admin may provision)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    targetUser = { id: "u2", role: "member", disabledAt: null };
    const res = await post({ name: "k", kind: "mcp", forUserId: "u2" });
    expect(res.status).toBe(403);
    expect(inserts).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  test("admin provisions for a member → 200; token row userId=target, createdByUserId=actor, name marked; audited", async () => {
    mockAuth.mockResolvedValue({ user: { id: "admin1", role: "admin", name: "Alice" } } as never);
    targetUser = { id: "u2", role: "member", disabledAt: null };
    const res = await post({ name: "ci-bot", kind: "api", forUserId: "u2" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body.forUserId).toBe("u2");
    expect(body.token).toBe("laam_personaltoken5678");

    const v = inserts[0];
    expect(v.userId).toBe("u2"); // attributed to the target
    expect(v.createdByUserId).toBe("admin1"); // provenance = the admin
    expect(v.name).toBe("ci-bot (provisioned by Alice)"); // self-documenting marker
    expect(v.scopes).toEqual(["read"]);

    // audited as token_issued_for {actor, subject, tokenId, kind}, no secret.
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe("token_issued_for");
    const t = JSON.parse(audits[0].target as string);
    expect(t).toMatchObject({ actor: "admin1", subject: "u2", kind: "api" });
    expect(t.tokenId).toBe("newtoken");
  });

  test("Rule 13: inserted userId is the DB-validated target id, NOT the echoed forUserId", async () => {
    // The looked-up row has a DIFFERENT id than the request body — the code must
    // trust the row, never the client value.
    mockAuth.mockResolvedValue({ user: { id: "admin1", role: "admin", name: "Alice" } } as never);
    targetUser = { id: "REAL-u2", role: "member", disabledAt: null };
    await post({ name: "k", kind: "mcp", forUserId: "SPOOFED-id" });
    // the lookup queried users BY the requested id (users.id == forUserId)...
    expect((whereArgs.at(-1) as { _eq: [string, string] })._eq).toEqual(["u.id", "SPOOFED-id"]);
    // ...then trusted the RETURNED row's id for the insert, never the echoed body value.
    expect(inserts[0].userId).toBe("REAL-u2");
  });

  test("the token secret is NEVER written into the audit target", async () => {
    mockAuth.mockResolvedValue({ user: { id: "admin1", role: "admin", name: "Alice" } } as never);
    targetUser = { id: "u2", role: "member", disabledAt: null };
    await post({ name: "k", kind: "mcp", forUserId: "u2" });
    expect(audits[0].target).not.toContain("laam_personaltoken5678");
  });

  test("target not found → 404, no insert", async () => {
    mockAuth.mockResolvedValue({ user: { id: "admin1", role: "admin", name: "Alice" } } as never);
    targetUser = undefined; // lookup misses
    const res = await post({ name: "k", kind: "mcp", forUserId: "ghost" });
    expect(res.status).toBe(404);
    expect(inserts).toHaveLength(0);
  });

  test("target disabled → 400, no insert (never resurrect a credential for an off-boarded user)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "admin1", role: "admin", name: "Alice" } } as never);
    targetUser = { id: "u2", role: "member", disabledAt: new Date() };
    const res = await post({ name: "k", kind: "mcp", forUserId: "u2" });
    expect(res.status).toBe(400);
    expect(inserts).toHaveLength(0);
  });

  test("admin → owner/admin target → 403 (attribution-laundering guard)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "admin1", role: "admin", name: "Alice" } } as never);
    targetUser = { id: "owner1", role: "owner", disabledAt: null };
    const res = await post({ name: "k", kind: "mcp", forUserId: "owner1" });
    expect(res.status).toBe(403);
    expect(inserts).toHaveLength(0);
  });

  test("owner → admin target → 200 (only owner may provision for privileged users)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "owner1", role: "owner", name: "Owner" } } as never);
    targetUser = { id: "admin2", role: "admin", disabledAt: null };
    const res = await post({ name: "k", kind: "mcp", forUserId: "admin2" });
    expect(res.status).toBe(200);
    expect(inserts[0].userId).toBe("admin2");
  });

  test("audit-insert failure aborts the whole provisioning (no ok:true with an unaudited token)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "admin1", role: "admin", name: "Alice" } } as never);
    targetUser = { id: "u2", role: "member", disabledAt: null };
    auditFails = true;
    // The tx callback throws when the audit insert fails → POST rejects (→ 500),
    // it must NEVER resolve to a success response carrying a token.
    await expect(post({ name: "k", kind: "mcp", forUserId: "u2" })).rejects.toThrow();
  });
});

describe("GET /api/access-tokens", () => {
  test("401 unauth (zero-arg call still supported)", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await GET()).status).toBe(401);
  });

  test("returns only the caller's api/mcp tokens (collector filtered out)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    selectRows = [
      { id: "a", kind: "api", name: "x", prefix: "laam_aaaa", last4: "1111" },
      { id: "c", kind: "collector", name: "box", prefix: "laam_cccc", last4: "2222" },
      { id: "m", kind: "mcp", name: "y", prefix: "laam_mmmm", last4: "3333" },
    ];
    const body = await (await GET(new Request("http://x/api/access-tokens"))).json();
    expect(body.tokens.map((t: { id: string }) => t.id)).toEqual(["a", "m"]);
  });

  test("projection NEVER includes tokenHash (the secret cannot leak via the list)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    await GET(new Request("http://x/api/access-tokens"));
    expect(Object.keys(lastProjection ?? {})).not.toContain("tokenHash");
    expect(Object.keys(lastProjection ?? {})).toContain("createdByUserId");
  });

  test("member ?userId=other is IGNORED — query is forced to the caller's own id", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    await GET(new Request("http://x/api/access-tokens?userId=u2"));
    const w = whereArgs.at(-1) as { _eq: [string, string] };
    expect(w._eq[1]).toBe("u1"); // NOT u2 — a member can never read another's tokens
  });

  test("admin ?userId=other → queries THAT user's tokens", async () => {
    mockAuth.mockResolvedValue({ user: { id: "admin1", role: "admin" } } as never);
    await GET(new Request("http://x/api/access-tokens?userId=u2"));
    const w = whereArgs.at(-1) as { _eq: [string, string] };
    expect(w._eq[1]).toBe("u2");
  });

  test("admin with NO param → still scoped to self", async () => {
    mockAuth.mockResolvedValue({ user: { id: "admin1", role: "admin" } } as never);
    await GET(new Request("http://x/api/access-tokens"));
    const w = whereArgs.at(-1) as { _eq: [string, string] };
    expect(w._eq[1]).toBe("admin1");
  });
});
