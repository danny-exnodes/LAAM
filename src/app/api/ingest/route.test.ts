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

// Size guard (W2/M7): a hostile or buggy collector must not be able to make the
// server buffer + JSON.parse an arbitrarily large body. The cap is enforced on
// the bytes actually STREAMED — a request can omit / lie about content-length
// (chunked transfer), so trusting the header is a bypass. Auth (401) stays AHEAD
// of the size check (413) so an unauthenticated flood is rejected even cheaper.
describe("POST /api/ingest — payload size guard (streamed-bytes cap)", () => {
  const MAX = 5 * 1024 * 1024;

  // Build a JSON body whose serialized size is `bytes`, padded inside `sessions`
  // so an oversized body is also structurally valid JSON (proves we 413 on size,
  // not on a parse error).
  function bodyOfSize(bytes: number): string {
    const skeleton = JSON.stringify({ projects: [], sessions: [{ pad: "" }] });
    const pad = "x".repeat(Math.max(0, bytes - skeleton.length));
    return JSON.stringify({ projects: [], sessions: [{ pad }] });
  }

  // A request whose body is delivered as a chunked stream with NO content-length
  // header — the old header-only guard could not see this body's true size.
  function chunkedReq(jsonText: string, headers?: Record<string, string>) {
    const bytes = new TextEncoder().encode(jsonText);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // Emit in small slices so the cap trips mid-stream, not on one buffer.
        const SLICE = 64 * 1024;
        for (let i = 0; i < bytes.length; i += SLICE) {
          controller.enqueue(bytes.subarray(i, i + SLICE));
        }
        controller.close();
      },
    });
    return new Request("http://x/api/ingest", {
      method: "POST",
      headers: { authorization: "Bearer laam_new", "content-type": "application/json", ...headers },
      body: stream,
      // @ts-expect-error undici requires duplex for a stream body
      duplex: "half",
    });
  }

  beforeEach(() => {
    mockVerify.mockResolvedValue({ id: "t1", machineId: "m1", kind: "collector" } as never);
    setDb([{ id: "m1", name: "An's box" }]);
  });

  test("oversized body WITH a content-length header → 413, body never upserted", async () => {
    const json = bodyOfSize(MAX + 1024);
    const req = chunkedReq(json, { "content-length": String(json.length) });
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBeTruthy();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  test("oversized body WITHOUT a content-length header (chunked) → still 413", async () => {
    // The bypass the header-only guard missed: no content-length to inspect, so
    // the cap must come from the streamed bytes themselves.
    const req = chunkedReq(bodyOfSize(MAX + 1024));
    expect(req.headers.get("content-length")).toBeNull();
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  test("under-cap body (no content-length) → parsed + upserted normally", async () => {
    const req = ingestReq("laam_new");
    expect(req.headers.get("content-length")).toBeNull();
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith("m1", [], expect.any(Array));
  });

  test("unauthenticated oversized body → 401 (auth precedes the size check)", async () => {
    // Bearer omitted → must 401 before we even read/cap the body.
    const json = bodyOfSize(MAX + 1024);
    const stream = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(new TextEncoder().encode(json)); c.close(); },
    });
    const req = new Request("http://x/api/ingest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: stream,
      // @ts-expect-error undici requires duplex for a stream body
      duplex: "half",
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
