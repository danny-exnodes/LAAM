import { beforeEach, describe, expect, test, vi } from "vitest";

type Row = { secret: string };
const rows: { queryResult: Row[] } = { queryResult: [] };

// Chainable Drizzle stubs. select->from->where returns an array.
const selectWhere = vi.fn(async () => rows.queryResult);
const insertOnConflict = vi.fn(async () => undefined);
const deleteWhere = vi.fn(async () => undefined);

vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: selectWhere }) }),
    insert: () => ({ values: () => ({ onConflictDoUpdate: insertOnConflict }) }),
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

  test("delCreds deletes the row", async () => {
    await delCreds("u1", "github");
    expect(deleteWhere).toHaveBeenCalledTimes(1);
  });
});
