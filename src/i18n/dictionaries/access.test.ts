import { expect, test } from "vitest";
import { accessDict } from "./access";
import { resolve } from "../index";

test("access dict has full vi/en/zh parity for every key", () => {
  const keys = Object.keys(accessDict);
  expect(keys.length).toBeGreaterThan(0);
  for (const k of keys) {
    expect(accessDict[k].vi, `${k}.vi`).toBeTruthy();
    expect(accessDict[k].en, `${k}.en`).toBeTruthy();
    expect(accessDict[k].zh, `${k}.zh`).toBeTruthy();
  }
});

test("issued-token banner interpolates {name} in every language", () => {
  for (const lang of ["vi", "en", "zh"] as const) {
    expect(resolve(accessDict, lang, "access.issued", { name: "ci bot" })).toContain("ci bot");
  }
});
