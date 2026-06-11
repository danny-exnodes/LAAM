import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/access-token", () => ({
  generateAccessToken: () => "laam_personaltoken5678",
  formatTokenDisplay: (t: string) => ({ prefix: t.slice(0, 9), last4: t.slice(-4) }),
  hashToken: (t: string) => `hash:${t}`,
}));
import { auth } from "@/auth";
const mockAuth = vi.mocked(auth);

vi.mock("@/db/schema", () => ({ accessTokens: { __t: "access_token" } }));

let selectRows: unknown[] = [];
const inserts: unknown[] = [];
vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ orderBy: async () => selectRows }) }) }),
    insert: () => ({ values: (v: unknown) => { inserts.push(v); return { returning: async () => [{ id: "new" }] }; } }),
  },
}));

import { GET, POST } from "./route";

beforeEach(() => { vi.clearAllMocks(); inserts.length = 0; selectRows = []; });

describe("POST /api/access-tokens", () => {
  test("401 unauth", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ name: "k", kind: "mcp" }) }));
    expect(res.status).toBe(401);
  });

  test("viewer → 403, no token issued (read-only cannot mint api/mcp tokens)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "viewer" } } as never);
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ name: "k", kind: "mcp" }) }));
    expect(res.status).toBe(403);
    expect(inserts).toHaveLength(0);
  });

  test("400 for a non api/mcp kind (collector not issuable here)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ name: "k", kind: "collector" }) }));
    expect(res.status).toBe(400);
    expect(inserts).toHaveLength(0);
  });

  test("creates mcp token for caller (userId=self, scopes read), returns token once", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ name: "ext agent", kind: "mcp" }) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBe("laam_personaltoken5678");
    expect(body.prefix).toBe("laam_pers");
    const v = inserts[0] as Record<string, unknown>;
    expect(v.kind).toBe("mcp");
    expect(v.userId).toBe("u1");
    expect(v.scopes).toEqual(["read"]);
    expect(v.tokenHash).toBe("hash:laam_personaltoken5678");
  });
});

describe("GET /api/access-tokens", () => {
  test("401 unauth", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await GET()).status).toBe(401);
  });

  test("returns only the caller's api/mcp tokens (collector filtered out)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    selectRows = [
      { id: "a", kind: "api", name: "x", prefix: "laam_aaaa", last4: "1111" },
      { id: "c", kind: "collector", name: "box", prefix: "laam_cccc", last4: "2222" },
      { id: "m", kind: "mcp", name: "y", prefix: "laam_mmmm", last4: "3333" },
    ];
    const body = await (await GET()).json();
    expect(body.tokens.map((t: { id: string }) => t.id)).toEqual(["a", "m"]);
  });
});
