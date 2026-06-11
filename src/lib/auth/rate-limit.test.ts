import { describe, expect, test } from "vitest";

import { clientIpFrom, createFixedWindowLimiter, createLoginLockout } from "./rate-limit";

function fakeClock(start = 1_000_000) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("createFixedWindowLimiter — register spam guard", () => {
  test("allows exactly `limit` hits per window, then blocks — unauthenticated spam cannot exhaust bcrypt/DB", () => {
    const clock = fakeClock();
    const limiter = createFixedWindowLimiter({ limit: 10, windowMs: 60 * 60 * 1000, clock: clock.now });
    for (let i = 0; i < 10; i++) {
      expect(limiter.consume("1.2.3.4"), `hit ${i + 1} must pass`).toBe(true);
    }
    expect(limiter.consume("1.2.3.4")).toBe(false);
    // Still inside the same window 59 minutes later → still blocked.
    clock.advance(59 * 60 * 1000);
    expect(limiter.consume("1.2.3.4")).toBe(false);
  });

  test("a new window opens after windowMs — legitimate users are not banned forever", () => {
    const clock = fakeClock();
    const limiter = createFixedWindowLimiter({ limit: 2, windowMs: 1000, clock: clock.now });
    expect(limiter.consume("ip")).toBe(true);
    expect(limiter.consume("ip")).toBe(true);
    expect(limiter.consume("ip")).toBe(false);
    clock.advance(1000);
    expect(limiter.consume("ip")).toBe(true);
  });

  test("keys are isolated — one abusive IP cannot consume another IP's budget", () => {
    const clock = fakeClock();
    const limiter = createFixedWindowLimiter({ limit: 1, windowMs: 1000, clock: clock.now });
    expect(limiter.consume("attacker")).toBe(true);
    expect(limiter.consume("attacker")).toBe(false);
    expect(limiter.consume("victim")).toBe(true);
  });
});

describe("createLoginLockout — credential brute-force guard", () => {
  const OPTS = { maxFails: 5, failWindowMs: 10 * 60 * 1000, lockMs: 15 * 60 * 1000 };

  test("locks on the 5th failure within 10 minutes, not before — a few typos must not lock a real user", () => {
    const clock = fakeClock();
    const lockout = createLoginLockout({ ...OPTS, clock: clock.now });
    for (let i = 0; i < 4; i++) {
      lockout.recordFailure("a@x.vn");
      clock.advance(60 * 1000);
    }
    expect(lockout.isLocked("a@x.vn")).toBe(false);
    lockout.recordFailure("a@x.vn");
    expect(lockout.isLocked("a@x.vn")).toBe(true);
  });

  test("lock expires after 15 minutes AND the fail history resets — one stale failure must not re-lock", () => {
    const clock = fakeClock();
    const lockout = createLoginLockout({ ...OPTS, clock: clock.now });
    for (let i = 0; i < 5; i++) lockout.recordFailure("a@x.vn");
    expect(lockout.isLocked("a@x.vn")).toBe(true);
    clock.advance(15 * 60 * 1000 - 1);
    expect(lockout.isLocked("a@x.vn")).toBe(true);
    clock.advance(1);
    expect(lockout.isLocked("a@x.vn")).toBe(false);
    // Fresh slate: a single new failure is failure #1, not #6.
    lockout.recordFailure("a@x.vn");
    expect(lockout.isLocked("a@x.vn")).toBe(false);
  });

  test("a successful login resets the counter — the lock targets sustained guessing, not normal use", () => {
    const clock = fakeClock();
    const lockout = createLoginLockout({ ...OPTS, clock: clock.now });
    for (let i = 0; i < 4; i++) lockout.recordFailure("a@x.vn");
    lockout.recordSuccess("a@x.vn");
    for (let i = 0; i < 4; i++) lockout.recordFailure("a@x.vn");
    expect(lockout.isLocked("a@x.vn")).toBe(false);
  });

  test("failures older than the 10-minute window do not count toward the lock", () => {
    const clock = fakeClock();
    const lockout = createLoginLockout({ ...OPTS, clock: clock.now });
    for (let i = 0; i < 4; i++) lockout.recordFailure("a@x.vn");
    clock.advance(10 * 60 * 1000 + 1);
    // 5th failure overall, but the previous 4 fell out of the window.
    lockout.recordFailure("a@x.vn");
    expect(lockout.isLocked("a@x.vn")).toBe(false);
  });

  test("lockout is per-email — locking one account does not deny service to others", () => {
    const clock = fakeClock();
    const lockout = createLoginLockout({ ...OPTS, clock: clock.now });
    for (let i = 0; i < 5; i++) lockout.recordFailure("victim@x.vn");
    expect(lockout.isLocked("victim@x.vn")).toBe(true);
    expect(lockout.isLocked("other@x.vn")).toBe(false);
  });
});

describe("clientIpFrom — rate-limit key extraction", () => {
  test("uses the FIRST hop of x-forwarded-for (the client; later hops are proxy-appended and spoof-resistant)", () => {
    expect(clientIpFrom(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" }))).toBe("203.0.113.7");
  });

  test("falls back to x-real-ip, then a shared bucket — never a per-request key that would disable the limit", () => {
    expect(clientIpFrom(new Headers({ "x-real-ip": "198.51.100.9" }))).toBe("198.51.100.9");
    expect(clientIpFrom(new Headers())).toBe("unknown");
    expect(clientIpFrom(new Headers({ "x-forwarded-for": " " }))).toBe("unknown");
  });
});
