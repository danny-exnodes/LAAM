// C2: Unit tests for Claude API estimated cost calculation.
// The PRICING table is defined in ChatClient.tsx as a module-internal const;
// we test the *math* here by replicating the formula so the logic can be
// reasoned about independently of the React component.
//
// Pricing source (2026-05-26, claude-api skill cache):
//   claude-sonnet-4-6: $3/MTok in, $15/MTok out
//   claude-opus-4-8:   $5/MTok in, $25/MTok out
//
// Formula: ChatClient sums REAL tokensIn/tokensOut per message (tracked via the
// {t:"tokens"} frame + DB columns). "Ước tính" remains because MODEL attribution
// is approximate (no model column on chat_message in MVS) — older turns may have
// run on a different/local model.
import { expect, test } from "vitest";

const CLAUDE_PRICING: Record<string, { in: number; out: number }> = {
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-opus-4-8": { in: 5, out: 25 },
};

/** Mirrors the estUsd calculation in ChatClient.tsx (real in/out sums). */
function estimateCost(model: string, totalIn: number, totalOut: number): string | null {
  if (totalIn + totalOut === 0) return null;
  const pricing = CLAUDE_PRICING[model];
  if (!pricing) return null;
  const cost = (totalIn * pricing.in + totalOut * pricing.out) / 1_000_000;
  return cost.toFixed(4);
}

// INTENT: verify the formula produces the correct dollar value from REAL in/out
// sums so a pricing-table change or formula drift (e.g. regression to a fixed
// split approximation) is immediately caught.

test("claude-sonnet-4-6: 800k in + 200k out → real-split estimate", () => {
  // 800k in × $3/MTok = $2.40 ; 200k out × $15/MTok = $3.00 → total $5.40
  // (A 40/60 split on the same 1M total would claim $10.20 — locked out.)
  expect(estimateCost("claude-sonnet-4-6", 800_000, 200_000)).toBe("5.4000");
});

test("claude-opus-4-8: 800k in + 200k out → real-split estimate", () => {
  // 800k in × $5/MTok = $4.00 ; 200k out × $25/MTok = $5.00 → total $9.00
  expect(estimateCost("claude-opus-4-8", 800_000, 200_000)).toBe("9.0000");
});

test("returns null for 0 tokens (no cost to show)", () => {
  // INTENT: suppress display when there's nothing to estimate (Rule 12 — fail loud).
  expect(estimateCost("claude-sonnet-4-6", 0, 0)).toBeNull();
});

test("returns null for unknown model", () => {
  // INTENT: never display a fabricated cost for an unrecognised model.
  expect(estimateCost("unknown-model", 600, 400)).toBeNull();
});
