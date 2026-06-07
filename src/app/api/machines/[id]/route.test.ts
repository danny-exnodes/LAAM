import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
const mockAuth = vi.mocked(auth);

// Tagged schema objects so we can tell which table an update() targeted.
// vi.hoisted so they exist when the hoisted vi.mock factory runs.
const { MACHINES, ACCESS } = vi.hoisted(() => ({
  MACHINES: { __t: "machine" },
  ACCESS: { __t: "access_token" },
}));
vi.mock("@/db/schema", () => ({ machines: MACHINES, accessTokens: ACCESS }));

function fakeDb() {
  const updates: { table: unknown; patch: unknown }[] = [];
  const db = {
    update: (table: unknown) => ({
      set: (patch: unknown) => ({ where: async () => { updates.push({ table, patch }); } }),
    }),
  };
  return { db, updates };
}
let _db: ReturnType<typeof fakeDb>["db"];
let _updates: ReturnType<typeof fakeDb>["updates"];
vi.mock("@/db", () => ({ get db() { return _db; } }));

import { DELETE } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  const f = fakeDb();
  _db = f.db as never;
  _updates = f.updates;
});

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("DELETE /api/machines/[id] — dual-revoke (A1)", () => {
  test("401 when logged out", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await DELETE(new Request("http://x"), params("m1"));
    expect(res.status).toBe(401);
    expect(_updates).toHaveLength(0);
  });

  test("403 for non owner/admin", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const res = await DELETE(new Request("http://x"), params("m1"));
    expect(res.status).toBe(403);
    expect(_updates).toHaveLength(0);
  });

  test("revokes BOTH paths: machines.tokenHash=null AND access_token.revokedAt set for the machine", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "owner" } } as never);
    const res = await DELETE(new Request("http://x"), params("m1"));
    expect(res.status).toBe(200);

    const machineUpdate = _updates.find((u) => u.table === MACHINES);
    const tokenUpdate = _updates.find((u) => u.table === ACCESS);

    // legacy path nulled
    expect(machineUpdate).toBeTruthy();
    expect((machineUpdate!.patch as { tokenHash: unknown }).tokenHash).toBeNull();

    // access_token path revoked (so the collector can't keep pushing through it)
    expect(tokenUpdate).toBeTruthy();
    expect((tokenUpdate!.patch as { revokedAt: Date }).revokedAt).toBeInstanceOf(Date);
  });
});
