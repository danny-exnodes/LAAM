// In-memory abuse guards for the auth surface. Single-process assumption: the
// app runs as exactly one Docker container, so per-process Maps are authoritative.
// Pure module (no Next/DB imports); `clock` is injectable so tests control time.

type Clock = () => number;

export type FixedWindowLimiter = {
  /** Counts one hit for `key`. Returns false when the key exceeded `limit` in the current window. */
  consume(key: string): boolean;
};

export function createFixedWindowLimiter(opts: {
  limit: number;
  windowMs: number;
  clock?: Clock;
}): FixedWindowLimiter {
  const { limit, windowMs, clock = Date.now } = opts;
  const windows = new Map<string, { start: number; count: number }>();
  return {
    consume(key) {
      const now = clock();
      const w = windows.get(key);
      if (!w || now - w.start >= windowMs) {
        windows.set(key, { start: now, count: 1 });
        return limit >= 1;
      }
      w.count += 1;
      return w.count <= limit;
    },
  };
}

export type LoginLockout = {
  isLocked(key: string): boolean;
  recordFailure(key: string): void;
  recordSuccess(key: string): void;
};

export function createLoginLockout(opts: {
  maxFails: number;
  failWindowMs: number;
  lockMs: number;
  clock?: Clock;
}): LoginLockout {
  const { maxFails, failWindowMs, lockMs, clock = Date.now } = opts;
  const entries = new Map<string, { fails: number[]; lockedUntil: number }>();
  return {
    isLocked(key) {
      const e = entries.get(key);
      if (!e) return false;
      if (e.lockedUntil > clock()) return true;
      // Expired lock: drop it together with the fail history, so a single new
      // failure after the lock does not immediately re-lock.
      if (e.lockedUntil !== 0) entries.delete(key);
      return false;
    },
    recordFailure(key) {
      const now = clock();
      const e = entries.get(key) ?? { fails: [], lockedUntil: 0 };
      e.fails = e.fails.filter((t) => now - t < failWindowMs);
      e.fails.push(now);
      if (e.fails.length >= maxFails) {
        e.lockedUntil = now + lockMs;
        e.fails = [];
      }
      entries.set(key, e);
    },
    recordSuccess(key) {
      entries.delete(key);
    },
  };
}

/**
 * Client key for rate limiting: first hop of x-forwarded-for (the original
 * client as recorded by the first proxy — later hops are proxy-appended), then
 * x-real-ip. Route handlers don't expose the raw socket address, so with no
 * proxy headers everything shares one "unknown" bucket (fail-closed for abuse).
 */
export function clientIpFrom(headers: Headers): string {
  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (first) return first;
  return headers.get("x-real-ip")?.trim() || "unknown";
}
