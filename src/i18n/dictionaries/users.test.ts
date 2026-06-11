import { expect, test } from "vitest";
import { usersDict } from "./users";
import { resolve } from "../index";

// Parity contract: every key ships vi/en/zh so a non-vi admin never sees a raw key.
test("users dict has full vi/en/zh parity for every key", () => {
  const keys = Object.keys(usersDict);
  expect(keys.length).toBeGreaterThan(0);
  for (const k of keys) {
    expect(usersDict[k].vi, `${k}.vi`).toBeTruthy();
    expect(usersDict[k].en, `${k}.en`).toBeTruthy();
    expect(usersDict[k].zh, `${k}.zh`).toBeTruthy();
  }
});

test("disable confirm interpolates {name} in every language", () => {
  for (const lang of ["vi", "en", "zh"] as const) {
    expect(resolve(usersDict, lang, "users.confirmDisable", { name: "Bea" })).toContain("Bea");
  }
});

test("all four roles have a label", () => {
  for (const r of ["owner", "admin", "member", "viewer"]) {
    expect(resolve(usersDict, "en", `users.role.${r}`)).toBeTruthy();
  }
});
