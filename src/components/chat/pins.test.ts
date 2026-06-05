import { describe, it, expect, beforeEach } from "vitest";
import { loadPins, savePins, togglePin } from "./pins";

beforeEach(() => localStorage.clear());

describe("pins (localStorage)", () => {
  it("loads an empty set when nothing is stored", () => {
    expect(loadPins().size).toBe(0);
  });

  it("save → load round-trips the ids", () => {
    savePins(new Set(["a", "b"]));
    expect([...loadPins()].sort()).toEqual(["a", "b"]);
  });

  it("togglePin adds then removes an id and persists each time", () => {
    const added = togglePin(new Set(), "x");
    expect(added.has("x")).toBe(true);
    expect(loadPins().has("x")).toBe(true); // persisted

    const removed = togglePin(added, "x");
    expect(removed.has("x")).toBe(false);
    expect(loadPins().has("x")).toBe(false); // persisted
  });

  it("togglePin returns a new set (does not mutate the input)", () => {
    const original = new Set(["a"]);
    const next = togglePin(original, "b");
    expect(original.has("b")).toBe(false); // input untouched
    expect(next.has("b")).toBe(true);
  });

  it("loadPins is fail-soft on corrupt storage", () => {
    localStorage.setItem("laam_chat_pins", "{not json");
    expect(loadPins().size).toBe(0);
  });
});
