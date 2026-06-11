import { expect, test } from "vitest";
import { notificationsDict } from "./notifications";
import { resolve } from "../index";

// Parity contract: every key ships vi/en/zh so a non-vi user never sees a raw key.
test("notifications dict has full vi/en/zh parity for every key", () => {
  const keys = Object.keys(notificationsDict);
  expect(keys.length).toBeGreaterThan(0);
  for (const k of keys) {
    expect(notificationsDict[k].vi, `${k}.vi`).toBeTruthy();
    expect(notificationsDict[k].en, `${k}.en`).toBeTruthy();
    expect(notificationsDict[k].zh, `${k}.zh`).toBeTruthy();
  }
});

test("unread/relative-time keys interpolate {n} in every language", () => {
  for (const lang of ["vi", "en", "zh"] as const) {
    for (const k of ["notif.unreadCount", "notif.minutesAgo", "notif.hoursAgo", "notif.daysAgo"]) {
      expect(resolve(notificationsDict, lang, k, { n: 7 })).toContain("7");
    }
  }
});
