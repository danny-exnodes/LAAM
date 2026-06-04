import { describe, it, expect } from "vitest";
import { fmtDateTime } from "./format";

// fmtDateTime must be DETERMINISTIC across ambient locale/timezone so SSR (server)
// and client render the identical string — otherwise React hydration mismatches
// (machines-manager "lần cuối <time>"). It pins vi-VN + 24h + Asia/Ho_Chi_Minh.
describe("fmtDateTime", () => {
  it("renders in pinned Asia/Ho_Chi_Minh time (24h), not the ambient UTC/en-US", () => {
    // 2026-06-04T15:58:14Z == 22:58:14 in Asia/Ho_Chi_Minh (UTC+7)
    const s = fmtDateTime("2026-06-04T15:58:14Z");
    expect(s).toMatch(/22:58/); // tz pinned to +07 (would be 15:58 under UTC)
    expect(s).not.toMatch(/AM|PM/i); // 24-hour (would be "PM" under en-US default)
    expect(s).not.toMatch(/15:58/); // definitely not UTC
  });
  it("accepts an epoch number too", () => {
    expect(fmtDateTime(Date.parse("2026-06-04T15:58:14Z"))).toMatch(/22:58/);
  });
  it("returns empty string for null/undefined", () => {
    expect(fmtDateTime(null)).toBe("");
    expect(fmtDateTime(undefined)).toBe("");
  });
});
