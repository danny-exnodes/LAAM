import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/events-bus", () => ({ publish: vi.fn() }));
vi.mock("@/lib/workflow/runtime", () => ({ buildRunNode: vi.fn() }));
vi.mock("@/lib/workflow/run", () => ({ executeRun: vi.fn() }));
vi.mock("@/db", () => ({ db: {} }));

import { auth } from "@/auth";
import { executeRun } from "@/lib/workflow/run";
import { POST } from "./route";

const mockAuth = vi.mocked(auth);
const mockExecuteRun = vi.mocked(executeRun);

function ctx(id = "wf1") {
  return { params: Promise.resolve({ id }) };
}
function req(body?: unknown) {
  return new Request("http://x", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockExecuteRun.mockResolvedValue({ ok: true } as never);
});

describe("POST /api/workflows/[id]/run — RBAC (dryRun=false fires REAL connector writes)", () => {
  test("401 when unauthenticated — executeRun never called", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await POST(req(), ctx());
    expect(res.status).toBe(401);
    expect(mockExecuteRun).not.toHaveBeenCalled();
  });

  test("viewer → 403, run does NOT execute (the live hole: viewer could fire writes)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "viewer" } } as never);
    const res = await POST(req({ dryRun: false }), ctx());
    expect(res.status).toBe(403);
    // The load-bearing assertion: no side effect — the connector-writing run never starts.
    expect(mockExecuteRun).not.toHaveBeenCalled();
  });

  test("member → proceeds to executeRun", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const res = await POST(req(), ctx());
    expect(res.status).toBe(200);
    expect(mockExecuteRun).toHaveBeenCalledTimes(1);
  });
});
