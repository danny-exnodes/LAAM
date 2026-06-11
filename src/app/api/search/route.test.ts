import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/db", () => ({ db: {} })); // route imports @/db (pg Pool) — stub for jsdom
vi.mock("@/lib/search", () => ({ searchAll: vi.fn() }));

import { auth } from "@/auth";
import { searchAll } from "@/lib/search";
import { GET } from "./route";

const mockAuth = vi.mocked(auth);
const mockSearchAll = vi.mocked(searchAll);

const EMPTY = { sessions: [], conversations: [], workflows: [] };

beforeEach(() => vi.clearAllMocks());

describe("GET /api/search", () => {
  test("401 when logged out — and the search never runs", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await GET(new Request("http://x/api/search?q=laam"));
    expect(res.status).toBe(401);
    expect(mockSearchAll).not.toHaveBeenCalled();
  });

  test("searches as the SESSION user (private groups scoped server-side, not by a client param)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    mockSearchAll.mockResolvedValue({
      ...EMPTY,
      conversations: [{ id: "c1", title: "Deploy", updatedAt: null }],
    });
    const res = await GET(new Request("http://x/api/search?q=deploy&userId=u2"));
    expect(res.status).toBe(200);
    // userId comes from the session — the ?userId=u2 in the URL must be ignored.
    expect(mockSearchAll).toHaveBeenCalledWith({}, "deploy", "u1");
    expect(await res.json()).toEqual({
      ...EMPTY,
      conversations: [{ id: "c1", title: "Deploy", updatedAt: null }],
    });
  });

  test("missing q → searches with the empty string (lib returns empty groups)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    mockSearchAll.mockResolvedValue(EMPTY);
    const res = await GET(new Request("http://x/api/search"));
    expect(res.status).toBe(200);
    expect(mockSearchAll).toHaveBeenCalledWith({}, "", "u1");
    expect(await res.json()).toEqual(EMPTY);
  });
});
