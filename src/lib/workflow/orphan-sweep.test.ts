import { describe, test, expect, vi } from "vitest";
import { sweepOrphanedRuns } from "./orphan-sweep";

describe("sweepOrphanedRuns", () => {
  test("flips running → resumable and returns the affected count", async () => {
    const where = vi.fn(async () => ({ rowCount: 3 }));
    const set = vi.fn(() => ({ where }));
    const db = { update: vi.fn(() => ({ set })) } as never;
    const n = await sweepOrphanedRuns(db);
    expect(n).toBe(3);
    expect(set).toHaveBeenCalledWith({ status: "resumable" });
  });

  test("returns 0 when rowCount is absent (no orphans)", async () => {
    const db = { update: () => ({ set: () => ({ where: async () => ({}) }) }) } as never;
    expect(await sweepOrphanedRuns(db)).toBe(0);
  });
});
