import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
const mockAuth = vi.mocked(auth);

const h = vi.hoisted(() => ({
  listArgs: undefined as unknown[] | undefined,
  unreadArg: undefined as unknown,
  listRows: [] as unknown[],
  unread: 0,
  markArgs: undefined as unknown[] | undefined,
}));

vi.mock("@/lib/notifications", () => ({
  listForUser: vi.fn(async (...a: unknown[]) => { h.listArgs = a; return h.listRows; }),
  unreadCount: vi.fn(async (uid: unknown) => { h.unreadArg = uid; return h.unread; }),
  markRead: vi.fn(async (...a: unknown[]) => { h.markArgs = a; }),
}));

import { GET } from "./route";
import { PATCH } from "./[id]/route";
import { POST as readAll } from "./read-all/route";

afterEach(() => {
  h.listArgs = undefined;
  h.unreadArg = undefined;
  h.listRows = [];
  h.unread = 0;
  h.markArgs = undefined;
  vi.clearAllMocks();
});

const req = (url: string) => new Request(url);

describe("GET /api/notifications", () => {
  test("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await GET(req("http://x/api/notifications"));
    expect(res.status).toBe(401);
  });

  test("lists ONLY the caller's notifications (scoped to session.user.id)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "userA" } } as never);
    h.listRows = [{ id: "n1", userId: "userA" }];
    h.unread = 1;
    const res = await GET(req("http://x/api/notifications"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notifications).toEqual([{ id: "n1", userId: "userA" }]);
    expect(body.unread).toBe(1);
    // CRITICAL: the userId passed to the lib is the SESSION user — a caller cannot
    // pass someone else's id (no userId param is read from the request).
    expect(h.listArgs?.[0]).toBe("userA");
    expect(h.unreadArg).toBe("userA");
  });

  test("?unread=1 filters to unread; ?limit caps", async () => {
    mockAuth.mockResolvedValue({ user: { id: "userA" } } as never);
    await GET(req("http://x/api/notifications?unread=1&limit=10"));
    expect(h.listArgs?.[1]).toMatchObject({ unreadOnly: true, limit: 10 });
  });
});

describe("PATCH /api/notifications/:id — mark own read", () => {
  test("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await PATCH(req("http://x"), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(401);
  });

  test("marks read scoped to the session user (can't mark another user's)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "userA" } } as never);
    const res = await PATCH(req("http://x"), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(200);
    // markRead(userId, id) — userId is the session's, NEVER request-supplied.
    expect(h.markArgs).toEqual(["userA", "n1"]);
  });
});

describe("POST /api/notifications/read-all", () => {
  test("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await readAll();
    expect(res.status).toBe(401);
  });

  test("marks all the session user's notifications read", async () => {
    mockAuth.mockResolvedValue({ user: { id: "userA" } } as never);
    const res = await readAll();
    expect(res.status).toBe(200);
    expect(h.markArgs).toEqual(["userA", "all"]);
  });
});
