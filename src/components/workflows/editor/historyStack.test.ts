import { describe, expect, test } from "vitest";
import { emptyHistory, pushSnapshot, undo, redo, canUndo, canRedo } from "./historyStack";
import type { Snapshot } from "./historyStack";

const snap = (sig: string): Snapshot => ({ nodes: [{ sig }], edges: [], sig });

describe("historyStack", () => {
  test("empty: cannot undo or redo", () => {
    const h = emptyHistory();
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
  });

  test("push appends and advances the pointer", () => {
    let h = emptyHistory();
    h = pushSnapshot(h, snap("a"));
    h = pushSnapshot(h, snap("b"));
    expect(h.stack.map((s) => s.sig)).toEqual(["a", "b"]);
    expect(h.pointer).toBe(1);
    expect(canUndo(h)).toBe(true);
    expect(canRedo(h)).toBe(false);
  });

  test("push with identical sig is a no-op (same reference)", () => {
    let h = pushSnapshot(emptyHistory(), snap("a"));
    const same = pushSnapshot(h, snap("a"));
    expect(same).toBe(h); // referential no-op so caller can skip work
  });

  test("undo then redo round-trips to the same snapshot", () => {
    let h = pushSnapshot(emptyHistory(), snap("a"));
    h = pushSnapshot(h, snap("b"));
    const u = undo(h);
    expect(u.snapshot?.sig).toBe("a");
    expect(u.history.pointer).toBe(0);
    const r = redo(u.history);
    expect(r.snapshot?.sig).toBe("b");
    expect(r.history.pointer).toBe(1);
  });

  test("undo at the start returns null snapshot, unchanged history", () => {
    const h = pushSnapshot(emptyHistory(), snap("a"));
    const u = undo(h);
    expect(u.snapshot).toBeNull();
    expect(u.history).toBe(h);
  });

  test("pushing after an undo truncates the redo tail", () => {
    let h = emptyHistory();
    h = pushSnapshot(h, snap("a"));
    h = pushSnapshot(h, snap("b"));
    h = pushSnapshot(h, snap("c"));
    h = undo(h).history; // pointer → 1 (b), redo tail = [c]
    h = pushSnapshot(h, snap("d")); // replaces the tail
    expect(h.stack.map((s) => s.sig)).toEqual(["a", "b", "d"]);
    expect(h.pointer).toBe(2);
    expect(canRedo(h)).toBe(false);
  });

  test("caps the stack at max, dropping the oldest", () => {
    let h = emptyHistory();
    for (let i = 0; i < 5; i++) h = pushSnapshot(h, snap(`s${i}`), 3);
    // only the last 3 survive; pointer at the newest
    expect(h.stack.map((s) => s.sig)).toEqual(["s2", "s3", "s4"]);
    expect(h.pointer).toBe(2);
  });
});
