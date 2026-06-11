import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
const mockAuth = vi.mocked(auth);

vi.mock("@/db/schema", () => ({ users: { __t: "user", createdAt: "createdAt" } }));

let selectRows: unknown[] = [];
const selected: { cols: unknown }[] = [];
vi.mock("@/db", () => ({
  db: {
    select: (cols: unknown) => {
      selected.push({ cols });
      return { from: () => ({ orderBy: async () => selectRows }) };
    },
  },
}));
vi.mock("drizzle-orm", () => ({ asc: (c: unknown) => ({ asc: c }) }));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  selectRows = [];
  selected.length = 0;
});

describe("GET /api/users", () => {
  test("401 when not logged in", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await GET()).status).toBe(401);
  });

  test("viewer → 403", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "viewer" } } as never);
    expect((await GET()).status).toBe(403);
  });

  test("member → 403 (only owner/admin may list users)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    expect((await GET()).status).toBe(403);
  });

  test("admin → 200 list", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "admin" } } as never);
    selectRows = [
      { id: "u1", name: "Ada", email: "ada@x", role: "owner", disabledAt: null, createdAt: new Date() },
    ];
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users).toHaveLength(1);
    expect(body.users[0].id).toBe("u1");
  });

  test("owner → 200, payload carries NO password/secret fields", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "owner" } } as never);
    selectRows = [
      { id: "u1", name: "Ada", email: "ada@x", role: "owner", disabledAt: null, createdAt: new Date() },
    ];
    await GET();
    // The route must project an explicit column set (no `select()` of the whole row),
    // so passwordHash can never leak. Assert the selected columns are the safe whitelist.
    const cols = selected[0].cols as Record<string, unknown>;
    expect(Object.keys(cols).sort()).toEqual(
      ["createdAt", "disabledAt", "email", "id", "name", "role"].sort(),
    );
  });
});
