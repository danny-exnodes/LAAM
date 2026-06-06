import { describe, test, expect, vi } from "vitest";
import { tickResume } from "./schedule";

// F2 regression: the claim is bounded + atomic INSIDE the UPDATE (id IN SELECT … LIMIT n
// FOR UPDATE SKIP LOCKED). A flip-all-then-slice(25) would strand runs 26+ as 'running'.
describe("tickResume — bounded atomic claim of resumable orphans", () => {
  const subChain = { from: () => ({ where: () => ({ limit: () => ({ for: () => [] }) }) }) };

  test("flips resumable→running atomically and resumes each claimed run", async () => {
    const claimed = [{ id: "r1" }, { id: "r2" }];
    const setSpy = vi.fn(() => ({ where: () => ({ returning: async () => claimed }) }));
    const db = { select: () => subChain, update: vi.fn(() => ({ set: setSpy })) } as never;
    const resumeRunRow = vi.fn(async () => ({ status: "succeeded" as const }));
    const n = await tickResume(db, { publish: vi.fn(), buildRunNode: (() => vi.fn()) as never, resumeRunRow });
    expect(setSpy).toHaveBeenCalledWith({ status: "running" });
    expect(resumeRunRow).toHaveBeenCalledTimes(2);
    expect(resumeRunRow).toHaveBeenCalledWith("r1", expect.anything());
    expect(resumeRunRow).toHaveBeenCalledWith("r2", expect.anything());
    expect(n).toBe(2);
  });

  test("returns 0 when no resumable runs", async () => {
    const db = {
      select: () => subChain,
      update: () => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) }),
    } as never;
    const resumeRunRow = vi.fn();
    const n = await tickResume(db, { publish: vi.fn(), buildRunNode: (() => vi.fn()) as never, resumeRunRow });
    expect(n).toBe(0);
    expect(resumeRunRow).not.toHaveBeenCalled();
  });
});
