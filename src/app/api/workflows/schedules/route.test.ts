// POST /api/workflows/schedules — creating a schedule arms AUTONOMOUS connector
// writes on every tick (it bypasses the gated /run endpoint). A viewer must NOT be
// able to create one. Gate sits before any cron parse / DB read or insert.
import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/workflow/cron", () => ({
  parseCron: vi.fn(),
  nextRunAt: vi.fn(() => new Date("2026-07-01T00:00:00Z")),
}));
vi.mock("@/db/schema", () => ({
  workflows: Object.assign({}, { [Symbol.for("drizzle:Name")]: "workflow" }),
  workflowSchedules: Object.assign({}, { [Symbol.for("drizzle:Name")]: "workflow_schedule" }),
}));

import { auth } from "@/auth";
import { parseCron } from "@/lib/workflow/cron";

const mockAuth = vi.mocked(auth);
const mockParseCron = vi.mocked(parseCron);

// fake db: select().from().where().limit() → owned workflow row; insert().values() tracks.
function fakeDb(wfRow: unknown) {
  const insertedRows: unknown[] = [];
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (wfRow ? [wfRow] : []),
        }),
      }),
    }),
    insert: () => ({
      values: async (v: unknown) => {
        insertedRows.push(v);
      },
    }),
  };
  return { db, insertedRows };
}

let _db: ReturnType<typeof fakeDb>["db"];
vi.mock("@/db", () => ({
  get db() {
    return _db;
  },
}));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://x", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockParseCron.mockReturnValue(undefined as never);
});

describe("POST /api/workflows/schedules — RBAC (schedule = autonomous connector writes)", () => {
  test("401 khi chưa đăng nhập — không insert", async () => {
    mockAuth.mockResolvedValue(null as never);
    const { db, insertedRows } = fakeDb({ id: "wf1", userId: "u1" });
    _db = db as never;
    const res = await POST(req({ workflowId: "wf1", cron: "0 8 * * *" }));
    expect(res.status).toBe(401);
    expect(insertedRows).toHaveLength(0);
  });

  test("viewer → 403, no schedule inserted, cron never parsed (gate is BEFORE work)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "viewer" } } as never);
    const { db, insertedRows } = fakeDb({ id: "wf1", userId: "u1" });
    _db = db as never;
    const res = await POST(req({ workflowId: "wf1", cron: "0 8 * * *" }));
    expect(res.status).toBe(403);
    // Load-bearing: the autonomous-write schedule is never created — gate precedes all work.
    expect(insertedRows).toHaveLength(0);
    expect(mockParseCron).not.toHaveBeenCalled();
  });

  test("member → schedule created (201, row inserted)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const { db, insertedRows } = fakeDb({ id: "wf1", userId: "u1" });
    _db = db as never;
    const res = await POST(req({ workflowId: "wf1", cron: "0 8 * * *" }));
    expect(res.status).toBe(201);
    expect(insertedRows).toHaveLength(1);
    expect((insertedRows[0] as { workflowId: string }).workflowId).toBe("wf1");
  });
});
