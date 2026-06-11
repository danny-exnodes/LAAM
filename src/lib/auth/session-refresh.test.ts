import { describe, it, expect, vi, type MockInstance } from "vitest";

// ------------------------------------------------------------------ mock db --
// We mock the db module so tests never touch Postgres. The helper must import
// from "@/db" — mock the same specifier that the implementation resolves to.
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
  },
}));
vi.mock("@/db/schema", async () => {
  const actual = await vi.importActual<typeof import("@/db/schema")>("@/db/schema");
  return { users: actual.users };
});

import { db } from "@/db";
import { refreshSessionFromDb } from "./session-refresh";

// Helper to set up db.select() to return a one-row result.
function mockDbRow(row: Record<string, unknown> | null) {
  const limit = vi.fn().mockResolvedValue(row ? [row] : []);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  (db.select as unknown as MockInstance).mockReturnValue({ from });
  return { from, where, limit };
}

// ------------------------------------------------------------------ tests ---

describe("refreshSessionFromDb — per-request JWT re-validation helper", () => {
  it("active user → valid=true + returns correct role", async () => {
    mockDbRow({ id: "u1", role: "admin", disabledAt: null });
    const result = await refreshSessionFromDb("u1");
    expect(result).toEqual({ valid: true, role: "admin" });
  });

  it("disabled user (disabledAt set) → valid=false, blocks session", async () => {
    mockDbRow({ id: "u1", role: "member", disabledAt: new Date() });
    const result = await refreshSessionFromDb("u1");
    expect(result).toEqual({ valid: false });
  });

  it("user no longer exists (deleted) → valid=false, blocks session", async () => {
    mockDbRow(null);
    const result = await refreshSessionFromDb("u1");
    expect(result).toEqual({ valid: false });
  });

  it("role changed in DB → returns NEW role (promotes/demotes without re-login)", async () => {
    mockDbRow({ id: "u1", role: "owner", disabledAt: null });
    const result = await refreshSessionFromDb("u1");
    expect(result).toEqual({ valid: true, role: "owner" });
  });

  it("DB throws → fail-open: valid=true with NO role (caller keeps old token role)", async () => {
    // A transient DB blip must NOT log everyone out. The caller is responsible
    // for keeping the old token role when role is undefined.
    const limit = vi.fn().mockRejectedValue(new Error("connection refused"));
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    (db.select as unknown as MockInstance).mockReturnValue({ from });

    const result = await refreshSessionFromDb("u1");
    expect(result).toEqual({ valid: true, role: undefined });
  });

  it("DB throws → does not rethrow (never crashes the jwt callback)", async () => {
    const limit = vi.fn().mockRejectedValue(new Error("timeout"));
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    (db.select as unknown as MockInstance).mockReturnValue({ from });

    await expect(refreshSessionFromDb("u1")).resolves.toBeDefined();
  });
});
