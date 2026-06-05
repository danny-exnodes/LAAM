import { describe, it, expect, beforeEach } from "vitest";
import { loadDismissed, dismissAlerts } from "./proactiveDismiss";

const DAY = 86_400_000;
beforeEach(() => localStorage.clear());

describe("proactiveDismiss (localStorage, S2)", () => {
  it("returns no dismissed keys initially", () => {
    expect(loadDismissed(1000).size).toBe(0);
  });

  it("persists dismissed keys and reloads them", () => {
    const now = 10 * DAY;
    dismissAlerts(["stuck:a", "cost:b"], now);
    const live = loadDismissed(now + 1000);
    expect([...live].sort()).toEqual(["cost:b", "stuck:a"]);
  });

  it("expires dismissals after 24h (alert may re-surface)", () => {
    const now = 10 * DAY;
    dismissAlerts(["stuck:a"], now);
    expect(loadDismissed(now + DAY + 1).has("stuck:a")).toBe(false); // expired
    expect(loadDismissed(now + DAY - 1).has("stuck:a")).toBe(true); // still within window
  });

  it("prunes expired entries on the next dismiss", () => {
    dismissAlerts(["old:1"], 0);
    dismissAlerts(["new:1"], 10 * DAY); // far past TTL → prunes old:1
    const raw = JSON.parse(localStorage.getItem("laam_proactive_dismissed") || "{}");
    expect(Object.keys(raw)).toEqual(["new:1"]);
  });
});
