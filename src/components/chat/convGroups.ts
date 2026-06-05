// FEAT-1 — group conversations for the sidebar: pinned first, then recency
// buckets (today / yesterday / last 7 days / older). Pure + now-injectable so
// it is deterministic and unit-testable. Day boundaries use UTC-day indices to
// stay timezone-independent in tests.

import type { Conv } from "./types";

export type ConvGroupKey = "pinned" | "today" | "yesterday" | "last7" | "older";
export type ConvGroup = { key: ConvGroupKey; convs: Conv[] };

const DAY = 86_400_000;
const dayIndex = (ms: number) => Math.floor(ms / DAY);

function bucketFor(updatedAt: string | null, nowDay: number): Exclude<ConvGroupKey, "pinned"> {
  if (!updatedAt) return "older";
  const t = Date.parse(updatedAt);
  if (Number.isNaN(t)) return "older";
  const diff = nowDay - dayIndex(t);
  if (diff <= 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff <= 6) return "last7";
  return "older";
}

// Order the visible groups appear in. Empty groups are dropped.
const ORDER: ConvGroupKey[] = ["pinned", "today", "yesterday", "last7", "older"];

export function groupConversations(convs: Conv[], pinned: Set<string>, now: number): ConvGroup[] {
  const nowDay = dayIndex(now);
  const buckets = new Map<ConvGroupKey, Conv[]>();
  const push = (k: ConvGroupKey, c: Conv) => {
    const arr = buckets.get(k) ?? [];
    arr.push(c);
    buckets.set(k, arr);
  };
  for (const c of convs) {
    if (pinned.has(c.id)) push("pinned", c);
    else push(bucketFor(c.updatedAt, nowDay), c);
  }
  return ORDER.map((key) => ({ key, convs: buckets.get(key) ?? [] })).filter((g) => g.convs.length > 0);
}
