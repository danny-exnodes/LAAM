import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/lib/access-token", () => ({
  verifyAccessToken: vi.fn(),
  hashToken: (t: string) => `hash:${t}`,
}));
vi.mock("@/lib/sync", () => ({ upsertSessions: vi.fn(async () => ({ projects: 1, sessions: 2 })) }));

import { verifyAccessToken } from "@/lib/access-token";
import { upsertSessions } from "@/lib/sync";

const mockVerify = vi.mocked(verifyAccessToken);
const mockUpsert = vi.mocked(upsertSessions);

// Fake db: select().from().where().limit() → configurable rows; update().set().where() captured.
function fakeDb(selectRows: unknown[]) {
  const updates: { patch: unknown }[] = [];
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => selectRows }),
      }),
    }),
    update: () => ({
      set: (patch: unknown) => ({ where: async () => { updates.push({ patch }); } }),
    }),
  };
  return { db, updates };
}
let _db: ReturnType<typeof fakeDb>["db"];
let _updates: ReturnType<typeof fakeDb>["updates"];
vi.mock("@/db", () => ({ get db() { return _db; } }));
vi.mock("@/db/schema", () => ({
  machines: Object.assign({}, { [Symbol.for("drizzle:Name")]: "machine" }),
}));

import { POST } from "./route";

function setDb(rows: unknown[]) {
  const f = fakeDb(rows);
  _db = f.db as never;
  _updates = f.updates;
}

function ingestReq(token?: string) {
  return new Request("http://x/api/ingest", {
    method: "POST",
    headers: token
      ? { authorization: `Bearer ${token}`, "content-type": "application/json" }
      : { "content-type": "application/json" },
    body: JSON.stringify({ projects: [], sessions: [] }),
  });
}

beforeEach(() => { vi.clearAllMocks(); });

describe("POST /api/ingest — access-token resolver (forward-compat)", () => {
  test("missing token → 401", async () => {
    setDb([]);
    const res = await POST(ingestReq());
    expect(res.status).toBe(401);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  test("(a) access_token(kind=collector) → 200, upserts under its machineId, bumps lastSeen", async () => {
    mockVerify.mockResolvedValue({ id: "t1", machineId: "m1", kind: "collector" } as never);
    setDb([{ id: "m1", name: "An's box" }]); // machine fetched by id
    const res = await POST(ingestReq("laam_new"));
    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith("m1", [], expect.any(Array));
    expect(_updates).toHaveLength(1); // machines.lastSeen bump
    const body = await res.json();
    expect(body.machine).toBe("An's box");
  });

  test("(b) legacy machines.tokenHash still works (fallback path) → 200", async () => {
    mockVerify.mockResolvedValue(null); // no access_token
    setDb([{ id: "m9", name: "legacy box" }]); // machine fetched by tokenHash
    const res = await POST(ingestReq("laam_legacy"));
    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith("m9", [], expect.any(Array));
    const body = await res.json();
    expect(body.machine).toBe("legacy box");
  });

  test("(c) unknown token (both paths miss) → 401", async () => {
    mockVerify.mockResolvedValue(null);
    setDb([]); // no machine by tokenHash either
    const res = await POST(ingestReq("laam_bad"));
    expect(res.status).toBe(401);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
