import { describe, expect, test, vi } from "vitest";
vi.mock("@/db", () => ({ db: {} })); // list-machines.ts nhập @/db (pg Pool) — stub cho jsdom
import { shapeMachines, type MachineRow } from "./list-machines";

const now = Date.UTC(2026, 5, 4, 12, 0, 0);
describe("shapeMachines", () => {
  test("online=true khi lastSeen trong 5'", () => {
    const rows: MachineRow[] = [
      { id: "m1", name: "PC", hostname: "pc", lastSeen: new Date(now - 60000) },
      { id: "m2", name: "Old", hostname: "old", lastSeen: new Date(now - 10 * 60000) },
    ];
    const out = shapeMachines(rows, now);
    expect(out[0].online).toBe(true);
    expect(out[1].online).toBe(false);
  });
});
