import { describe, expect, it } from "vitest";
import { isStuck } from "./stuck";

// Fixed clock so the time math is deterministic.
const NOW = 1_700_000_000_000;
const MIN = 60 * 1000;

describe("isStuck", () => {
  it("is true when a running session is older than the threshold", () => {
    // Stuck matters because a running agent that stopped writing its transcript
    // for >threshold is silently dead and needs an operator alert.
    const s = { status: "running", lastActivity: NOW - 11 * MIN };
    expect(isStuck(s, 10, NOW)).toBe(true);
  });

  it("is false when a running session is within the threshold", () => {
    const s = { status: "running", lastActivity: NOW - 9 * MIN };
    expect(isStuck(s, 10, NOW)).toBe(false);
  });

  it("is false exactly at the threshold (strictly greater-than)", () => {
    // Boundary: v1 uses `>`, so dead-on the threshold is NOT yet stuck.
    const s = { status: "running", lastActivity: NOW - 10 * MIN };
    expect(isStuck(s, 10, NOW)).toBe(false);
  });

  it("is never stuck once done, even if very old", () => {
    // A finished session legitimately stops writing — alerting on it is noise.
    const s = { status: "done", lastActivity: NOW - 999 * MIN };
    expect(isStuck(s, 10, NOW)).toBe(false);
  });

  it("treats idle (not done) like running for staleness", () => {
    const s = { status: "idle", lastActivity: NOW - 20 * MIN };
    expect(isStuck(s, 10, NOW)).toBe(true);
  });

  it("is false when lastActivity is missing", () => {
    expect(isStuck({ status: "running", lastActivity: null }, 10, NOW)).toBe(false);
    expect(isStuck({ status: "running", lastActivity: undefined }, 10, NOW)).toBe(false);
  });

  it("accepts a Date for lastActivity (DB rows) as well as epoch ms", () => {
    // The hook sees epoch numbers from SSE JSON; server code may pass Dates.
    const s = { status: "running", lastActivity: new Date(NOW - 11 * MIN) };
    expect(isStuck(s, 10, NOW)).toBe(true);
  });
});
