import { describe, it, expect } from "vitest";
import { constellation } from "./constellation";

describe("constellation dictionary", () => {
  it("has a non-empty vi/en/zh for every key", () => {
    const keys = Object.keys(constellation);
    expect(keys.length).toBeGreaterThanOrEqual(10);
    for (const [key, entry] of Object.entries(constellation)) {
      expect(entry.vi, `${key}.vi`).toBeTruthy();
      expect(entry.en, `${key}.en`).toBeTruthy();
      expect(entry.zh, `${key}.zh`).toBeTruthy();
    }
  });
});
