import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/workflow/validate", () => ({ assertRunnable: vi.fn() }));

const inserts: unknown[] = [];
vi.mock("@/db", () => ({
  db: {
    insert: () => ({ values: (v: unknown) => { inserts.push(v); } }),
  },
}));
vi.mock("@/db/schema", () => ({ workflows: { __t: "workflow" } }));

import { auth } from "@/auth";
import { assertRunnable } from "@/lib/workflow/validate";
import { POST } from "./route";

const mockAuth = vi.mocked(auth);
const mockAssertRunnable = vi.mocked(assertRunnable);

const validGraph = { nodes: [{ id: "n1", kind: "agent" as const, prompt: "hi" }], edges: [] };
function req(body: unknown) {
  return new Request("http://x", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  inserts.length = 0;
  mockAssertRunnable.mockReturnValue(undefined);
});

describe("POST /api/workflows — RBAC create gate", () => {
  test("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await POST(req({ name: "wf", graph: validGraph }));
    expect(res.status).toBe(401);
    expect(inserts).toHaveLength(0);
  });

  test("viewer → 403, no workflow inserted", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "viewer" } } as never);
    const res = await POST(req({ name: "wf", graph: validGraph }));
    expect(res.status).toBe(403);
    expect(inserts).toHaveLength(0);
  });

  test("member → creates workflow (201)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const res = await POST(req({ name: "wf", graph: validGraph }));
    expect(res.status).toBe(201);
    expect(inserts).toHaveLength(1);
  });
});
