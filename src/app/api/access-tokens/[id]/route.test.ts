import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
const mockAuth = vi.mocked(auth);

vi.mock("@/db/schema", () => ({
  accessTokens: { __t: "access_token", id: "at.id", userId: "at.userId", revokedAt: "at.revokedAt" },
}));
// The DELETE writes via update().set().where() and reports how many rows changed
// via .returning(). `affected` controls that count so we can assert 404 when the
// scoped WHERE matched nothing (e.g. member targeting another user's token).
let affected = 1;
const updates: { patch: unknown; where: unknown }[] = [];
vi.mock("@/db", () => ({
  db: {
    update: () => ({
      set: (patch: unknown) => ({
        where: (where: unknown) => ({
          returning: async () => {
            updates.push({ patch, where });
            return Array.from({ length: affected }, (_, i) => ({ id: `r${i}` }));
          },
        }),
      }),
    }),
  },
}));
vi.mock("drizzle-orm", () => ({
  and: (...xs: unknown[]) => ({ and: xs }),
  or: (...xs: unknown[]) => ({ or: xs }),
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  isNull: (c: unknown) => ({ isNull: c }),
}));

import { DELETE } from "./route";

beforeEach(() => { vi.clearAllMocks(); updates.length = 0; affected = 1; });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("DELETE /api/access-tokens/[id]", () => {
  test("401 unauth, no update", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await DELETE(new Request("http://x"), params("t1"));
    expect(res.status).toBe(401);
    expect(updates).toHaveLength(0);
  });

  test("member self-revoke → 200, sets revokedAt", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    affected = 1;
    const res = await DELETE(new Request("http://x"), params("t1"));
    expect(res.status).toBe(200);
    expect(updates).toHaveLength(1);
    expect((updates[0].patch as { revokedAt: Date }).revokedAt).toBeInstanceOf(Date);
  });

  test("member targeting ANOTHER user's token → 404 (scoped WHERE matches nothing)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    affected = 0; // the userId-bound WHERE matched no row
    const res = await DELETE(new Request("http://x"), params("t-other"));
    expect(res.status).toBe(404);
  });

  test("owner revoking ANOTHER user's token → 200 (admin/owner can revoke anyone's)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "owner1", role: "owner" } } as never);
    affected = 1;
    const res = await DELETE(new Request("http://x"), params("t-other"));
    expect(res.status).toBe(200);
  });

  test("admin revoking ANOTHER user's token → 200", async () => {
    mockAuth.mockResolvedValue({ user: { id: "admin1", role: "admin" } } as never);
    affected = 1;
    const res = await DELETE(new Request("http://x"), params("t-other"));
    expect(res.status).toBe(200);
  });
});
