import { describe, expect, test, vi } from "vitest";
vi.mock("@/db", () => ({ db: {} })); // search-sessions.ts imports @/db (pg Pool) — stub for jsdom
import { shapeSearch, type SearchRow } from "./search-sessions";

const now = Date.UTC(2026, 5, 6);

describe("shapeSearch", () => {
  test("maps matched rows to compact fields with a stuck flag", () => {
    const rows: SearchRow[] = [
      {
        id: "s1", projectId: "p1", machineId: "m1", model: "qwen", status: "running",
        lastActivity: new Date(now - 60_000), latestActivity: "đang sửa bug auth",
      },
    ];
    const out = shapeSearch(rows, now);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("s1");
    expect(out[0].project).toBe("p1");
    expect(out[0].latestActivity).toContain("auth");
    expect(typeof out[0].stuck).toBe("boolean");
  });

  test("empty result set → []", () => {
    expect(shapeSearch([], now)).toEqual([]);
  });
});
