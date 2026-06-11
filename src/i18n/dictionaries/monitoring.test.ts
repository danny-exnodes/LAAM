import { expect, test } from "vitest";
import { monitoringDict } from "./monitoring";
import { resolve } from "../index";

// Parity contract: every key ships vi/en/zh so a non-vi user never sees a raw key.
test("monitoring dict has full vi/en/zh parity for every key", () => {
  const keys = Object.keys(monitoringDict);
  expect(keys.length).toBeGreaterThan(0);
  for (const k of keys) {
    expect(monitoringDict[k].vi, `${k}.vi`).toBeTruthy();
    expect(monitoringDict[k].en, `${k}.en`).toBeTruthy();
    expect(monitoringDict[k].zh, `${k}.zh`).toBeTruthy();
  }
});

test("the three unified tabs (agents/chat/workflow) are localized in every language", () => {
  for (const lang of ["vi", "en", "zh"] as const) {
    for (const k of ["monitoring.tab.agents", "monitoring.tab.chat", "monitoring.tab.workflow"]) {
      expect(resolve(monitoringDict, lang, k), `${k}.${lang}`).not.toBe(k);
    }
  }
});

test("the freshness indicator interpolates {n} seconds in every language", () => {
  for (const lang of ["vi", "en", "zh"] as const) {
    expect(resolve(monitoringDict, lang, "monitoring.syncedAgo", { n: 12 })).toContain("12");
  }
});
