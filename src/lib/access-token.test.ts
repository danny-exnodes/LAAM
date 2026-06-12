import { describe, expect, test, vi, beforeEach } from "vitest";

// Fake drizzle db. verifyAccessToken does up to two selects: the token row, then
// (when the token has a userId) the owner's disabledAt. We route by table name:
// `user` → ownerRows, anything else → rows. update().set().where() records the patch.
function fakeDb(rows: unknown[], ownerRows: unknown[] = [{ disabledAt: null }]) {
  const updates: { patch: unknown }[] = [];
  const db = {
    select: () => ({
      from: (table: Record<symbol, string> = {}) => ({
        where: () => ({
          limit: async () =>
            table?.[Symbol.for("drizzle:Name")] === "user" ? ownerRows : rows,
        }),
      }),
    }),
    update: () => ({
      set: (patch: unknown) => ({
        where: async () => {
          updates.push({ patch });
        },
      }),
    }),
  };
  return { db, updates };
}

let _db: ReturnType<typeof fakeDb>["db"];
let _updates: ReturnType<typeof fakeDb>["updates"];
vi.mock("@/db", () => ({ get db() { return _db; } }));
vi.mock("@/db/schema", () => ({
  accessTokens: Object.assign({}, { [Symbol.for("drizzle:Name")]: "access_token" }),
  users: Object.assign({}, { [Symbol.for("drizzle:Name")]: "user" }, { id: "u.id", disabledAt: "u.disabledAt" }),
}));

import {
  generateAccessToken,
  hashToken,
  formatTokenDisplay,
  verifyAccessToken,
} from "./access-token";

function setDb(rows: unknown[], ownerRows?: unknown[]) {
  const f = fakeDb(rows, ownerRows);
  _db = f.db as never;
  _updates = f.updates;
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("generateAccessToken", () => {
  test("laam_-prefixed, high entropy, unique per call", () => {
    const a = generateAccessToken();
    const b = generateAccessToken();
    expect(a.startsWith("laam_")).toBe(true);
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(20);
  });
});

describe("hashToken", () => {
  test("sha256 hex, deterministic, 64 chars", () => {
    const h = hashToken("laam_abc");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("laam_abc")).toBe(h);
    expect(hashToken("laam_abd")).not.toBe(h);
  });
});

describe("formatTokenDisplay", () => {
  test("non-secret prefix + last4, deterministic", () => {
    const token = "laam_a3f2zzzzzzzzzzzzzzzzwxyz";
    const { prefix, last4 } = formatTokenDisplay(token);
    expect(prefix).toBe("laam_a3f2");
    expect(last4).toBe("wxyz");
    // prefix must not leak the whole secret
    expect(token.startsWith(prefix)).toBe(true);
    expect(prefix.length).toBeLessThan(token.length);
  });
});

describe("verifyAccessToken", () => {
  const base = {
    id: "t1",
    userId: "u1",
    kind: "collector",
    name: "An's box",
    prefix: "laam_a3f2",
    last4: "wxyz",
    tokenHash: hashToken("laam_good"),
    scopes: ["ingest"],
    machineId: "m1",
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    createdAt: new Date("2026-06-01"),
  };

  test("valid token → returns row and bumps lastUsedAt", async () => {
    const { updates } = setDb([{ ...base }]);
    const row = await verifyAccessToken("laam_good");
    expect(row?.id).toBe("t1");
    expect(updates).toHaveLength(1);
    expect((updates[0].patch as { lastUsedAt: Date }).lastUsedAt).toBeInstanceOf(Date);
  });

  test("unknown token → null, no bump", async () => {
    const { updates } = setDb([]);
    expect(await verifyAccessToken("laam_nope")).toBeNull();
    expect(updates).toHaveLength(0);
  });

  test("revoked token → null", async () => {
    setDb([{ ...base, revokedAt: new Date("2026-06-05") }]);
    expect(await verifyAccessToken("laam_good")).toBeNull();
  });

  test("expired token → null", async () => {
    setDb([{ ...base, expiresAt: new Date(Date.now() - 1000) }]);
    expect(await verifyAccessToken("laam_good")).toBeNull();
  });

  test("future expiry → valid", async () => {
    setDb([{ ...base, expiresAt: new Date(Date.now() + 60_000) }]);
    expect((await verifyAccessToken("laam_good"))?.id).toBe("t1");
  });

  test("kind filter mismatch → null", async () => {
    setDb([{ ...base, kind: "api" }]);
    expect(await verifyAccessToken("laam_good", { kind: "collector" })).toBeNull();
  });

  test("kind filter match → row", async () => {
    setDb([{ ...base, kind: "collector" }]);
    expect((await verifyAccessToken("laam_good", { kind: "collector" }))?.id).toBe("t1");
  });

  test("owner disabled → null even when the token row is NOT revoked (disable is authoritative)", async () => {
    // The token itself looks valid (revokedAt null), but the owning user is disabled.
    // Defense-in-depth: a missed token-revoke must not leave a live credential.
    const { updates } = setDb([{ ...base, revokedAt: null }], [{ disabledAt: new Date("2026-06-10") }]);
    expect(await verifyAccessToken("laam_good")).toBeNull();
    expect(updates).toHaveLength(0); // rejected before the lastUsedAt bump
  });

  test("owner active → valid (the disabled re-check passes through)", async () => {
    setDb([{ ...base, revokedAt: null }], [{ disabledAt: null }]);
    expect((await verifyAccessToken("laam_good"))?.id).toBe("t1");
  });

  test("token with null userId (collector provenance) → skips the owner check, still valid", async () => {
    // A null userId means there is no owner to off-board; the disabled lookup is
    // skipped entirely (and must not throw or wrongly reject).
    const { updates } = setDb([{ ...base, userId: null }]);
    expect((await verifyAccessToken("laam_good"))?.id).toBe("t1");
    expect(updates).toHaveLength(1); // lastUsedAt still bumped
  });
});
