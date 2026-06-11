import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Fixed string, deliberately NOT derived from the input password: the route
// must persist what bcrypt returns, never an echo of the raw secret.
vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn(async () => "$2b$12$mocked-bcrypt-output") },
}));

import bcrypt from "bcryptjs";
const mockHash = vi.mocked(bcrypt.hash);

// Real schema (pure drizzle pg-core defs) so eq(users.email, …) works and the
// insert target can be identity-checked. Only the connection (@/db) is faked.
import { users } from "@/db/schema";

type DbState = { existing: { id: string }[]; userCount: number };
let state: DbState;
let emailLookups: number;
let inserts: { table: unknown; values: Record<string, unknown> }[];

const fakeDb = {
  select: () => ({
    from: () => ({
      // `await db.select(...).from(users)` → user count (thenable, no where()).
      then: (resolve: (rows: { n: number }[]) => void) => resolve([{ n: state.userCount }]),
      // `...where(eq(users.email, …)).limit(1)` → email-existence lookup.
      where: () => {
        emailLookups += 1;
        return { limit: async () => state.existing };
      },
    }),
  }),
  insert: (table: unknown) => ({
    values: async (values: Record<string, unknown>) => {
      inserts.push({ table, values });
    },
  }),
};
vi.mock("@/db", () => ({ get db() { return fakeDb; } }));

import { POST } from "./route";

const VALID = { name: "An", email: "an@x.vn", password: "password123" };

// The route's rate limiter is module-level with a real clock, so every test
// uses a unique synthetic IP; only the dedicated 429 test reuses one.
let ipSeq = 0;
function post(body: unknown, ip?: string) {
  return POST(
    new Request("http://x/api/register", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip ?? `test-ip-${++ipSeq}` },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  state = { existing: [], userCount: 0 };
  emailLookups = 0;
  inserts = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("REGISTER_MODE=open (default) — existing behaviour preserved", () => {
  test("first registered user becomes owner (bootstrap invariant)", async () => {
    state = { existing: [], userCount: 0 };
    const res = await post(VALID);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe(users);
    expect(inserts[0].values.role).toBe("owner");
  });

  test("subsequent users default to member, never a privileged role", async () => {
    state = { existing: [], userCount: 3 };
    const res = await post(VALID);
    expect(res.status).toBe(200);
    expect(inserts[0].values.role).toBe("member");
  });

  test("duplicate email → 409 (unchanged contract with the register page)", async () => {
    state = { existing: [{ id: "u1" }], userCount: 3 };
    const res = await post(VALID);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Email đã tồn tại" });
    expect(inserts).toHaveLength(0);
  });

  test("hashes with bcrypt cost 12 and persists the hash — never the raw password", async () => {
    const res = await post(VALID);
    expect(res.status).toBe(200);
    expect(mockHash).toHaveBeenCalledWith("password123", 12);
    expect(inserts[0].values.passwordHash).toBe("$2b$12$mocked-bcrypt-output");
    expect(inserts[0].values.passwordHash).not.toContain("password123");
  });
});

describe("REGISTER_MODE=invite", () => {
  beforeEach(() => {
    vi.stubEnv("REGISTER_MODE", "invite");
    vi.stubEnv("REGISTER_INVITE_CODE", "secret-code");
    state = { existing: [], userCount: 3 };
  });

  test("wrong or missing invite code → 403, nothing inserted", async () => {
    const wrong = await post({ ...VALID, inviteCode: "guess" });
    expect(wrong.status).toBe(403);
    expect(await wrong.json()).toEqual({ error: "Mã mời không hợp lệ" });
    const missing = await post(VALID);
    expect(missing.status).toBe(403);
    expect(inserts).toHaveLength(0);
  });

  test("correct invite code → registration proceeds", async () => {
    const res = await post({ ...VALID, inviteCode: "secret-code" });
    expect(res.status).toBe(200);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].values.role).toBe("member");
  });

  test("unset/empty REGISTER_INVITE_CODE fails closed — an unconfigured gate must reject everyone, not admit everyone", async () => {
    vi.stubEnv("REGISTER_INVITE_CODE", "");
    // Even a client sending an empty code must not match the empty server value.
    const empty = await post({ ...VALID, inviteCode: "" });
    expect(empty.status).toBe(403);
    const none = await post(VALID);
    expect(none.status).toBe(403);
    expect(inserts).toHaveLength(0);
  });

  test("wrong code yields identical 403s whether or not the email exists — no email enumeration without a valid code", async () => {
    // The current route discloses duplicates to LEGITIMATE registrants
    // (409 "Email đã tồn tại"), so full anti-enumeration is not the existing
    // pattern. The property hardened here: the invite gate rejects BEFORE the
    // email lookup, so callers without a valid code get a byte-identical
    // response (and zero DB reads → no timing signal) either way.
    state = { existing: [{ id: "u1" }], userCount: 3 };
    const taken = await post({ ...VALID, email: "taken@x.vn", inviteCode: "guess" });
    state = { existing: [], userCount: 3 };
    const fresh = await post({ ...VALID, email: "fresh@x.vn", inviteCode: "guess" });
    expect(taken.status).toBe(403);
    expect(fresh.status).toBe(403);
    expect(await taken.json()).toEqual(await fresh.json());
    expect(emailLookups).toBe(0);
  });

  test("correct code + duplicate email → 409 (matches the route's existing disclosure to valid registrants)", async () => {
    state = { existing: [{ id: "u1" }], userCount: 3 };
    const res = await post({ ...VALID, inviteCode: "secret-code" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Email đã tồn tại" });
  });
});

describe("REGISTER_MODE=closed", () => {
  beforeEach(() => {
    vi.stubEnv("REGISTER_MODE", "closed");
  });

  test("empty users table → first-owner bootstrap still allowed (a closed instance must not be unbootstrappable)", async () => {
    state = { existing: [], userCount: 0 };
    const res = await post(VALID);
    expect(res.status).toBe(200);
    expect(inserts[0].values.role).toBe("owner");
  });

  test("non-empty users table → every registration is rejected", async () => {
    state = { existing: [], userCount: 1 };
    const res = await post(VALID);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Đăng ký đang đóng" });
    expect(inserts).toHaveLength(0);
  });

  test("an unrecognized REGISTER_MODE value fails closed — a typo'd env var must not silently reopen registration", async () => {
    vi.stubEnv("REGISTER_MODE", "opne");
    state = { existing: [], userCount: 1 };
    const res = await post(VALID);
    expect(res.status).toBe(403);
  });
});

describe("rate limit — 10 requests/hour/IP", () => {
  test("the 11th request from one IP → 429; other IPs keep their own budget", async () => {
    // Registration is unauthenticated and bcrypt-heavy → per-IP cap is the
    // only thing standing between a public Funnel URL and a hash-DoS.
    vi.stubEnv("REGISTER_MODE", "closed");
    state = { existing: [], userCount: 1 };
    for (let i = 0; i < 10; i++) {
      const res = await post(VALID, "flood-ip");
      expect(res.status, `request ${i + 1} passes the limiter`).toBe(403);
    }
    const eleventh = await post(VALID, "flood-ip");
    expect(eleventh.status).toBe(429);
    expect(await eleventh.json()).toEqual({ error: "Quá nhiều yêu cầu, thử lại sau" });
    const otherIp = await post(VALID, "innocent-ip");
    expect(otherIp.status).toBe(403);
  });
});

describe("input validation", () => {
  test("invalid body → 400 (unchanged)", async () => {
    const res = await post({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Dữ liệu không hợp lệ" });
  });
});
