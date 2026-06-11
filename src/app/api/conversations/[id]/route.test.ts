import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/db/schema", () => ({
  chatConversations: { __t: "chat_conversations" },
  chatMessages: { __t: "chat_messages" },
}));

let deleted = false;
const ownConv = { id: "c1", userId: "u1", title: "t" };
vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [ownConv] }) }) }),
    delete: () => ({ where: async () => { deleted = true; } }),
  },
}));

import { auth } from "@/auth";
import { DELETE } from "./route";

const mockAuth = vi.mocked(auth);
const ctx = { params: Promise.resolve({ id: "c1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  deleted = false;
});

describe("DELETE /api/conversations/[id] — RBAC", () => {
  test("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx);
    expect(res.status).toBe(401);
    expect(deleted).toBe(false);
  });

  test("viewer → 403, conversation never deleted (gate fires before db.delete)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "viewer" } } as never);
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx);
    expect(res.status).toBe(403);
    expect(deleted).toBe(false);
  });

  test("member → deletes own conversation", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx);
    expect(res.status).toBe(200);
    expect(deleted).toBe(true);
  });
});
