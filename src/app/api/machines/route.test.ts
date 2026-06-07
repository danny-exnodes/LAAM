import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/access-token", () => ({
  generateAccessToken: () => "laam_freshtokenvalue1234",
  formatTokenDisplay: (t: string) => ({ prefix: t.slice(0, 9), last4: t.slice(-4) }),
  hashToken: (t: string) => `hash:${t}`,
  machinesWithActiveToken: vi.fn(async () => new Set<string>()),
}));

import { auth } from "@/auth";
import { machinesWithActiveToken } from "@/lib/access-token";
const mockAuth = vi.mocked(auth);
const mockActive = vi.mocked(machinesWithActiveToken);

const { MACHINES, ACCESS } = vi.hoisted(() => ({
  MACHINES: { __t: "machine" },
  ACCESS: { __t: "access_token" },
}));
vi.mock("@/db/schema", () => ({ machines: MACHINES, accessTokens: ACCESS }));

function fakeDb(selectRows: unknown[]) {
  const inserts: { table: unknown; values: unknown }[] = [];
  const db = {
    select: () => ({ from: () => ({ orderBy: async () => selectRows }) }),
    insert: (table: unknown) => ({ values: async (values: unknown) => { inserts.push({ table, values }); } }),
    transaction: async (cb: (tx: unknown) => Promise<void>) => cb(db),
  };
  return { db, inserts };
}
let _db: ReturnType<typeof fakeDb>["db"];
let _inserts: ReturnType<typeof fakeDb>["inserts"];
vi.mock("@/db", () => ({ get db() { return _db; } }));

import { GET, POST } from "./route";

function setDb(rows: unknown[] = []) {
  const f = fakeDb(rows);
  _db = f.db as never;
  _inserts = f.inserts;
}

beforeEach(() => { vi.clearAllMocks(); setDb(); });

describe("POST /api/machines — issue via access_token (A2 userId)", () => {
  test("403 for non owner/admin", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ name: "box" }) }));
    expect(res.status).toBe(403);
    expect(_inserts).toHaveLength(0);
  });

  test("owner → creates machine (no tokenHash) + collector access_token with userId; returns token once", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "owner" } } as never);
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ name: "An's box" }) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBe("laam_freshtokenvalue1234");
    expect(body.prefix).toBe("laam_fres");
    expect(body.last4).toBe("1234");

    const machineIns = _inserts.find((i) => i.table === MACHINES);
    const tokenIns = _inserts.find((i) => i.table === ACCESS);
    // machine row no longer carries the token
    expect((machineIns!.values as { tokenHash?: unknown }).tokenHash).toBeUndefined();
    expect((machineIns!.values as { ownerUserId: string }).ownerUserId).toBe("u1");
    // access_token: kind, link, userId (provenance), scopes, hashed secret
    const tv = tokenIns!.values as Record<string, unknown>;
    expect(tv.kind).toBe("collector");
    expect(tv.userId).toBe("u1");
    expect(tv.machineId).toBe((machineIns!.values as { id: string }).id);
    expect(tv.scopes).toEqual(["ingest"]);
    expect(tv.tokenHash).toBe("hash:laam_freshtokenvalue1234");
  });
});

describe("GET /api/machines — hasToken from legacy OR active access_token", () => {
  test("hasToken true via legacy tokenHash and via active access_token; false otherwise", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    setDb([
      { id: "m1", name: "legacy", hostname: null, lastSeen: null, createdAt: null, tokenHash: "x" },
      { id: "m2", name: "new", hostname: null, lastSeen: null, createdAt: null, tokenHash: null },
      { id: "m3", name: "none", hostname: null, lastSeen: null, createdAt: null, tokenHash: null },
    ]);
    mockActive.mockResolvedValue(new Set(["m2"]));
    const res = await GET();
    const body = await res.json();
    const byId = Object.fromEntries(body.machines.map((m: { id: string; hasToken: boolean }) => [m.id, m.hasToken]));
    expect(byId).toEqual({ m1: true, m2: true, m3: false });
  });
});
