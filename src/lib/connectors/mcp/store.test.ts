import { beforeEach, describe, expect, test, vi } from "vitest";
import { encryptJson } from "../crypto";

type Row = { connectorId: string; secret: string };
const state: { rows: Row[]; inserted: { connectorId: string; secret: string }[] } = {
  rows: [],
  inserted: [],
};

// Chainable Drizzle stubs (mirror ../store.test.ts). select->from->where resolves
// to the configured rows; insert captures the row; delete is a no-op.
const selectWhere = vi.fn(async () => state.rows);
const insertOnConflict = vi.fn(async () => undefined);
const deleteWhere = vi.fn(async () => undefined);

vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: selectWhere }) }),
    insert: () => ({
      values: (v: { connectorId: string; secret: string }) => {
        state.inserted.push(v);
        return { onConflictDoUpdate: insertOnConflict };
      },
    }),
    delete: () => ({ where: deleteWhere }),
  },
}));
vi.mock("@/db/schema", () => ({
  connectorCredentials: { userId: "userId", connectorId: "connectorId" },
}));
// drizzle operators are irrelevant to the stubbed query — make them inert.
vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => a,
  eq: (...a: unknown[]) => a,
  like: (...a: unknown[]) => a,
}));

import { listServers, getServer, addServer, removeServer } from "./store";

beforeEach(() => {
  state.rows = [];
  state.inserted = [];
  selectWhere.mockClear();
  insertOnConflict.mockClear();
  deleteWhere.mockClear();
});

describe("mcp store", () => {
  test("listServers decrypts each mcp row and derives slug from connectorId", async () => {
    state.rows = [
      { connectorId: "mcp:github", secret: encryptJson({ name: "GitHub", url: "https://a", trustReadHints: true }) },
      { connectorId: "mcp:linear", secret: encryptJson({ name: "Linear", url: "https://b", authToken: "tok", trustReadHints: false }) },
    ];
    const servers = await listServers("u1");
    expect(servers).toHaveLength(2);
    expect(servers[0]).toEqual({ slug: "github", name: "GitHub", url: "https://a", trustReadHints: true });
    expect(servers[1].slug).toBe("linear");
    expect(servers[1].authToken).toBe("tok");
  });

  test("listServers skips an unreadable blob, keeps the rest", async () => {
    state.rows = [
      { connectorId: "mcp:ok", secret: encryptJson({ name: "OK", url: "https://a", trustReadHints: false }) },
      { connectorId: "mcp:bad", secret: "corrupt" },
    ];
    const servers = await listServers("u1");
    expect(servers.map((s) => s.slug)).toEqual(["ok"]);
  });

  test("getServer returns the decrypted config or null", async () => {
    state.rows = [{ connectorId: "mcp:foo", secret: encryptJson({ name: "Foo", url: "https://a", trustReadHints: false }) }];
    expect(await getServer("u1", "foo")).toMatchObject({ slug: "foo", name: "Foo" });

    state.rows = [];
    expect(await getServer("u1", "foo")).toBeNull();
  });

  test("addServer slugifies the name and stores an encrypted blob", async () => {
    const res = await addServer("u1", { name: "My Server!", url: "https://mcp.example.com" });
    expect(res.ok).toBe(true);
    expect(res.slug).toBe("my-server");
    expect(insertOnConflict).toHaveBeenCalledTimes(1);
    // persisted under connectorId "mcp:<slug>" and the secret is ciphertext.
    expect(state.inserted[0].connectorId).toBe("mcp:my-server");
    expect(state.inserted[0].secret).not.toContain("My Server");
  });

  test("addServer folds diacritics and ensures a non-empty slug", async () => {
    expect((await addServer("u1", { name: "Máy chủ", url: "https://x.com" })).slug).toBe("may-chu");
    state.inserted = [];
    // a name with no slug-able chars falls back to "server".
    expect((await addServer("u1", { name: "!!!", url: "https://x.com" })).slug).toBe("server");
  });

  test("addServer suffixes -2 when the slug already exists", async () => {
    state.rows = [{ connectorId: "mcp:github", secret: encryptJson({ name: "GitHub", url: "https://a", trustReadHints: false }) }];
    const res = await addServer("u1", { name: "GitHub", url: "https://mcp.example.com" });
    expect(res.slug).toBe("github-2");
  });

  test("addServer rejects an unsafe URL without writing", async () => {
    const res = await addServer("u1", { name: "Evil", url: "http://169.254.169.254/" });
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
    expect(insertOnConflict).not.toHaveBeenCalled();
  });

  test("removeServer deletes the mcp:<slug> row", async () => {
    const res = await removeServer("u1", "github");
    expect(res.ok).toBe(true);
    expect(deleteWhere).toHaveBeenCalledTimes(1);
  });
});
