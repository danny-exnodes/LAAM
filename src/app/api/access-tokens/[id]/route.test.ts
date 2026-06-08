import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
const mockAuth = vi.mocked(auth);

vi.mock("@/db/schema", () => ({ accessTokens: { __t: "access_token" } }));
const updates: { patch: unknown }[] = [];
vi.mock("@/db", () => ({
  db: { update: () => ({ set: (patch: unknown) => ({ where: async () => { updates.push({ patch }); } }) }) },
}));

import { DELETE } from "./route";

beforeEach(() => { vi.clearAllMocks(); updates.length = 0; });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("DELETE /api/access-tokens/[id]", () => {
  test("401 unauth, no update", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await DELETE(new Request("http://x"), params("t1"));
    expect(res.status).toBe(401);
    expect(updates).toHaveLength(0);
  });

  test("revokes (soft) — sets revokedAt", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const res = await DELETE(new Request("http://x"), params("t1"));
    expect(res.status).toBe(200);
    expect(updates).toHaveLength(1);
    expect((updates[0].patch as { revokedAt: Date }).revokedAt).toBeInstanceOf(Date);
  });
});
