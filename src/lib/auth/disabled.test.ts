import { describe, it, expect } from "vitest";
import { isUserDisabled } from "./disabled";

describe("isUserDisabled — off-boarding login gate", () => {
  it("active user (disabledAt null) → not disabled, login allowed", () => {
    expect(isUserDisabled({ disabledAt: null })).toBe(false);
  });

  it("user without the field → not disabled", () => {
    expect(isUserDisabled({})).toBe(false);
    expect(isUserDisabled(null)).toBe(false);
    expect(isUserDisabled(undefined)).toBe(false);
  });

  it("disabled user (disabledAt set) → login denied", () => {
    expect(isUserDisabled({ disabledAt: new Date() })).toBe(true);
  });
});
