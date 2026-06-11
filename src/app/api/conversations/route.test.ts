// POST /api/conversations — retitle / backfill-titles UPDATE conversation rows.
// A read-only viewer must not mutate titles. Gate sits before the body parse / DB work.
import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/chat/title", () => ({
  retitleFromMessage: vi.fn((s: string) => `clean:${s}`),
}));
vi.mock("@/db/schema", () => ({
  chatConversations: Object.assign({}, { [Symbol.for("drizzle:Name")]: "chat_conversation" }),
  chatMessages: Object.assign({}, { [Symbol.for("drizzle:Name")]: "chat_message" }),
}));

import { auth } from "@/auth";

const mockAuth = vi.mocked(auth);

// fake db: select chains resolve to the conversation row (or first-message content);
// update().set().where() records the patch so we can assert "no write" for a viewer.
function fakeDb(convRow: Record<string, unknown> | null) {
  const updates: unknown[] = [];
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (convRow ? [convRow] : []),
          orderBy: () => ({ limit: async () => [] }),
        }),
      }),
    }),
    update: () => ({
      set: (patch: unknown) => ({
        where: async () => {
          updates.push(patch);
        },
      }),
    }),
  };
  return { db, updates };
}

let _db: ReturnType<typeof fakeDb>["db"];
vi.mock("@/db", () => ({
  get db() {
    return _db;
  },
}));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://x/api/conversations", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/conversations — RBAC (retitle/backfill UPDATE rows)", () => {
  test("401 khi chưa đăng nhập — no update", async () => {
    mockAuth.mockResolvedValue(null as never);
    const { db, updates } = fakeDb({ id: "c1", userId: "u1", title: "--- Tệp: x" });
    _db = db as never;
    const res = await POST(req({ action: "retitle", id: "c1" }));
    expect(res.status).toBe(401);
    expect(updates).toHaveLength(0);
  });

  test("viewer → 403, conversation title NOT updated", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "viewer" } } as never);
    const { db, updates } = fakeDb({ id: "c1", userId: "u1", title: "--- Tệp: x" });
    _db = db as never;
    const res = await POST(req({ action: "retitle", id: "c1" }));
    expect(res.status).toBe(403);
    // Load-bearing: a read-only viewer cannot mutate conversation titles.
    expect(updates).toHaveLength(0);
  });

  test("member → passes the gate (proceeds to retitle, not 403)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const { db } = fakeDb({ id: "c1", userId: "u1", title: "--- Tệp: x" });
    _db = db as never;
    const res = await POST(req({ action: "retitle", id: "c1" }));
    expect(res.status).toBe(200);
  });
});
