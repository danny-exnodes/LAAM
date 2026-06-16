import { beforeEach, describe, expect, test, vi } from "vitest";

type Row = { secret: string };
const rows: { queryResult: Row[] } = { queryResult: [] };

// Chainable Drizzle stubs. select->from->where returns an array.
const selectWhere = vi.fn(async () => rows.queryResult);
const insertOnConflict = vi.fn(async () => undefined);
// Capture the row passed to .values() so tests can inspect the encrypted secret written.
const insertValues = vi.fn((_row: { secret: string }) => ({ onConflictDoUpdate: insertOnConflict }));
const deleteWhere = vi.fn(async () => undefined);

vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: selectWhere }) }),
    insert: () => ({ values: insertValues }),
    delete: () => ({ where: deleteWhere }),
  },
}));
vi.mock("@/db/schema", () => ({
  connectorCredentials: { userId: "userId", connectorId: "connectorId" },
}));

import { getCreds, setCreds, delCreds } from "./store";
import { encryptJson } from "./crypto";

beforeEach(() => {
  rows.queryResult = [];
  selectWhere.mockClear();
  insertOnConflict.mockClear();
  insertValues.mockClear();
  deleteWhere.mockClear();
});

describe("connector store", () => {
  test("getCreds returns null when no row", async () => {
    rows.queryResult = [];
    expect(await getCreds("u1", "github")).toBeNull();
  });

  test("getCreds decrypts the stored secret blob", async () => {
    rows.queryResult = [{ secret: encryptJson({ token: "ghp_x" }) }];
    expect(await getCreds("u1", "github")).toEqual({ token: "ghp_x" });
  });

  test("getCreds returns null on an unreadable blob", async () => {
    rows.queryResult = [{ secret: "corrupt" }];
    expect(await getCreds("u1", "github")).toBeNull();
  });

  test("setCreds upserts an encrypted blob", async () => {
    await setCreds("u1", "github", { token: "ghp_x" });
    expect(insertOnConflict).toHaveBeenCalledTimes(1);
  });

  test("setCreds writes a per-user (v2) blob that only the same user can read", async () => {
    await setCreds("userA", "github", { token: "ghp_a" });
    const written = insertValues.mock.calls[0][0].secret;
    expect(written.startsWith("v2:")).toBe(true); // per-user HKDF scheme, not the global key
    rows.queryResult = [{ secret: written }];
    expect(await getCreds("userA", "github")).toEqual({ token: "ghp_a" }); // owner reads
    expect(await getCreds("userB", "github")).toBeNull(); // cross-user → undecryptable → null
  });

  test("getCreds still reads a legacy global-key blob (lazy migration back-compat)", async () => {
    rows.queryResult = [{ secret: encryptJson({ token: "ghp_legacy" }) }]; // 3-part, global key
    expect(await getCreds("anyUser", "github")).toEqual({ token: "ghp_legacy" });
  });

  test("delCreds deletes the row", async () => {
    await delCreds("u1", "github");
    expect(deleteWhere).toHaveBeenCalledTimes(1);
  });
});
