import { describe, it, expect } from "vitest";
import { groupConversations } from "./convGroups";
import type { Conv } from "./types";

const DAY = 86_400_000;
const now = Date.UTC(2026, 5, 5, 12, 0, 0); // 2026-06-05 noon UTC
const at = (daysAgo: number): string => new Date(now - daysAgo * DAY).toISOString();

const C = (id: string, daysAgo: number | null): Conv => ({
  id,
  title: id,
  updatedAt: daysAgo === null ? null : at(daysAgo),
});

describe("groupConversations", () => {
  it("buckets by recency: today / yesterday / last7 / older", () => {
    const groups = groupConversations(
      [C("now", 0), C("yest", 1), C("wk", 3), C("old", 30)],
      new Set(),
      now,
    );
    const byKey = Object.fromEntries(groups.map((g) => [g.key, g.convs.map((c) => c.id)]));
    expect(byKey.today).toEqual(["now"]);
    expect(byKey.yesterday).toEqual(["yest"]);
    expect(byKey.last7).toEqual(["wk"]);
    expect(byKey.older).toEqual(["old"]);
  });

  it("puts pinned conversations in a leading 'pinned' group, excluded from time buckets", () => {
    const groups = groupConversations([C("a", 0), C("b", 1)], new Set(["b"]), now);
    expect(groups[0].key).toBe("pinned");
    expect(groups[0].convs.map((c) => c.id)).toEqual(["b"]);
    // b must not also appear under yesterday
    const yesterday = groups.find((g) => g.key === "yesterday");
    expect(yesterday).toBeUndefined();
  });

  it("treats a null updatedAt as older", () => {
    const groups = groupConversations([C("x", null)], new Set(), now);
    expect(groups.find((g) => g.key === "older")?.convs.map((c) => c.id)).toEqual(["x"]);
  });

  it("omits empty groups and preserves input order within a group", () => {
    const groups = groupConversations([C("a", 0), C("b", 0)], new Set(), now);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("today");
    expect(groups[0].convs.map((c) => c.id)).toEqual(["a", "b"]);
  });
});
