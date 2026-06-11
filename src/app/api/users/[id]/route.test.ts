import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
const mockAuth = vi.mocked(auth);

// roleEnum is consumed by rbac.ts (real) for the Role type; the route validates
// the role against this list, so the mock must expose the enum values.
vi.mock("@/db/schema", () => ({
  users: { __t: "user", id: "user.id", role: "user.role" },
  accessTokens: { __t: "access_token", userId: "at.userId" },
  machines: { __t: "machine", ownerUserId: "m.ownerUserId" },
  auditLog: { __t: "audit_log" },
  roleEnum: { enumValues: ["owner", "admin", "member", "viewer"] },
}));

// ---- db mock: records reads + the transaction's writes -------------------
// `targetRow` = the user being patched (lookup by id). `otherOwners` = number of
// owners (for the last-owner guards). The tx exposes update/insert that push to
// the shared arrays so tests can assert revoke/disable/audit happened.
let targetRow: Record<string, unknown> | undefined;
// What the route's otherOwnerCount() query resolves to: number of OTHER active
// owners. 0 ⇒ target is the last owner (guards must fire).
let otherOwners = 1;
const txUpdates: { table: unknown; patch: unknown }[] = [];
const txInserts: { table: unknown; values: unknown }[] = [];
let txCalled = false;

function makeDb() {
  // select() is overloaded: select({columns}) for the user lookup / column count.
  // We disambiguate by the `from` table via a closure recording the last from.
  const selectChain = (mode: "user" | "ownercount") => ({
    from: () => ({
      where: () => ({
        limit: async () => (mode === "user" ? (targetRow ? [targetRow] : []) : [{ n: otherOwners }]),
      }),
    }),
  });
  // The route does two distinct selects; we route by the projected columns.
  const tx = {
    select: (cols: Record<string, unknown>) =>
      "n" in cols ? selectChain("ownercount") : selectChain("user"),
    update: (table: unknown) => ({
      set: (patch: unknown) => ({ where: async () => { txUpdates.push({ table, patch }); } }),
    }),
    insert: (table: unknown) => ({ values: async (values: unknown) => { txInserts.push({ table, values }); } }),
  };
  return {
    select: tx.select,
    update: tx.update,
    insert: tx.insert,
    transaction: async (fn: (t: typeof tx) => Promise<void>) => {
      txCalled = true;
      await fn(tx);
    },
  };
}

vi.mock("@/db", () => ({ db: makeDb() }));
vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  and: (...xs: unknown[]) => ({ and: xs }),
  count: () => ({ n: true }),
  isNull: (c: unknown) => ({ isNull: c }),
  ne: (a: unknown, b: unknown) => ({ ne: [a, b] }),
}));

import { PATCH } from "./route";
import { users as usersTable, accessTokens as atTable, machines as mTable } from "@/db/schema";

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const body = (b: unknown) =>
  new Request("http://x", { method: "PATCH", body: JSON.stringify(b) });

beforeEach(() => {
  vi.clearAllMocks();
  txUpdates.length = 0;
  txInserts.length = 0;
  txCalled = false;
  otherOwners = 1;
  targetRow = { id: "u2", role: "member", disabledAt: null };
});

describe("PATCH /api/users/[id] — role change (owner-only)", () => {
  test("member → 403", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const res = await PATCH(body({ role: "admin" }), params("u2"));
    expect(res.status).toBe(403);
  });

  test("admin → 403 (admin cannot change roles)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "admin" } } as never);
    const res = await PATCH(body({ role: "admin" }), params("u2"));
    expect(res.status).toBe(403);
    expect(txUpdates).toHaveLength(0);
  });

  test("owner → 200, updates role + writes role_change audit", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "owner" } } as never);
    targetRow = { id: "u2", role: "member", disabledAt: null };
    const res = await PATCH(body({ role: "admin" }), params("u2"));
    expect(res.status).toBe(200);
    const roleUpdate = txUpdates.find(
      (u) => (u.patch as { role?: string }).role === "admin",
    );
    expect(roleUpdate).toBeTruthy();
    const audit = txInserts.find(
      (i) => (i.values as { action?: string }).action === "role_change",
    );
    expect(audit).toBeTruthy();
    const target = JSON.parse((audit!.values as { target: string }).target);
    expect(target).toMatchObject({ actor: "u1", subject: "u2", from: "member", to: "admin" });
  });

  test("invalid role → 400", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "owner" } } as never);
    const res = await PATCH(body({ role: "superadmin" }), params("u2"));
    expect(res.status).toBe(400);
  });

  test("cannot change your OWN role → 400", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "owner" } } as never);
    targetRow = { id: "u1", role: "owner", disabledAt: null };
    const res = await PATCH(body({ role: "member" }), params("u1"));
    expect(res.status).toBe(400);
    expect(txUpdates).toHaveLength(0);
  });

  test("cannot demote the LAST owner → 400", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "owner" } } as never);
    targetRow = { id: "u2", role: "owner", disabledAt: null };
    otherOwners = 0;
    const res = await PATCH(body({ role: "member" }), params("u2"));
    expect(res.status).toBe(400);
    expect(txUpdates).toHaveLength(0);
  });

  test("CAN demote an owner when another owner remains → 200", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "owner" } } as never);
    targetRow = { id: "u2", role: "owner", disabledAt: null };
    otherOwners = 1;
    const res = await PATCH(body({ role: "member" }), params("u2"));
    expect(res.status).toBe(200);
  });

  test("404 when target user does not exist", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "owner" } } as never);
    targetRow = undefined;
    const res = await PATCH(body({ role: "admin" }), params("ghost"));
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/users/[id] — disabled toggle (owner/admin)", () => {
  test("viewer → 403", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "viewer" } } as never);
    const res = await PATCH(body({ disabled: true }), params("u2"));
    expect(res.status).toBe(403);
  });

  test("member → 403", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const res = await PATCH(body({ disabled: true }), params("u2"));
    expect(res.status).toBe(403);
  });

  test("admin disables a member → 200, sets disabledAt + revokes tokens + clears legacy tokenHash", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "admin" } } as never);
    targetRow = { id: "u2", role: "member", disabledAt: null };
    const res = await PATCH(body({ disabled: true }), params("u2"));
    expect(res.status).toBe(200);
    expect(txCalled).toBe(true);
    // user row gets disabledAt set
    const userPatch = txUpdates.find((u) => u.table === usersTable);
    expect((userPatch!.patch as { disabledAt: Date }).disabledAt).toBeInstanceOf(Date);
    // access_token rows for the user get revokedAt set
    const tokPatch = txUpdates.find((u) => u.table === atTable);
    expect((tokPatch!.patch as { revokedAt: Date }).revokedAt).toBeInstanceOf(Date);
    // legacy machines.tokenHash cleared
    const machPatch = txUpdates.find((u) => u.table === mTable);
    expect((machPatch!.patch as { tokenHash: null }).tokenHash).toBeNull();
    // audit
    const audit = txInserts.find(
      (i) => (i.values as { action?: string }).action === "user_disabled",
    );
    expect(audit).toBeTruthy();
  });

  test("enabling a user clears disabledAt, does NOT revoke tokens", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "owner" } } as never);
    targetRow = { id: "u2", role: "member", disabledAt: new Date() };
    const res = await PATCH(body({ disabled: false }), params("u2"));
    expect(res.status).toBe(200);
    const userPatch = txUpdates.find((u) => u.table === usersTable);
    expect((userPatch!.patch as { disabledAt: null }).disabledAt).toBeNull();
    // no token revocation on enable
    const tokPatch = txUpdates.find((u) => u.table === atTable);
    expect(tokPatch).toBeUndefined();
    const audit = txInserts.find(
      (i) => (i.values as { action?: string }).action === "user_enabled",
    );
    expect(audit).toBeTruthy();
  });

  test("cannot disable YOURSELF → 400", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "owner" } } as never);
    targetRow = { id: "u1", role: "owner", disabledAt: null };
    const res = await PATCH(body({ disabled: true }), params("u1"));
    expect(res.status).toBe(400);
    expect(txCalled).toBe(false);
  });

  test("cannot disable the LAST owner → 400", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "admin" } } as never);
    targetRow = { id: "u2", role: "owner", disabledAt: null };
    otherOwners = 0;
    const res = await PATCH(body({ disabled: true }), params("u2"));
    expect(res.status).toBe(400);
    expect(txCalled).toBe(false);
  });

  test("404 when disabling a non-existent user", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "owner" } } as never);
    targetRow = undefined;
    const res = await PATCH(body({ disabled: true }), params("ghost"));
    expect(res.status).toBe(404);
  });

  test("400 when body has neither role nor disabled", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "owner" } } as never);
    const res = await PATCH(body({ foo: 1 }), params("u2"));
    expect(res.status).toBe(400);
  });
});
