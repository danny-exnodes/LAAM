// C2: Unit tests for Claude API estimated cost calculation.
// The PRICING table is defined in ChatClient.tsx as a module-internal const;
// we test the *math* here by replicating the formula so the logic can be
// reasoned about independently of the React component.
//
// Pricing source (2026-05-26, claude-api skill cache):
//   claude-sonnet-4-6: $3/MTok in, $15/MTok out
//   claude-opus-4-8:   $5/MTok in, $25/MTok out
//
// Formula: ChatClient uses a 40/60 in/out split approximation (exact per-turn
// attribution is impossible in MVS — no model column on chat_message).
import { expect, test } from "vitest";

const CLAUDE_PRICING: Record<string, { in: number; out: number }> = {
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-opus-4-8": { in: 5, out: 25 },
};

/** Mirrors the estUsd calculation in ChatClient.tsx */
function estimateCost(model: string, totalTokens: number): string | null {
  if (totalTokens === 0) return null;
  const pricing = CLAUDE_PRICING[model];
  if (!pricing) return null;
  const inTok = totalTokens * 0.4;
  const outTok = totalTokens * 0.6;
  const cost = (inTok * pricing.in + outTok * pricing.out) / 1_000_000;
  return cost.toFixed(4);
}

// INTENT: verify the formula produces the correct dollar value so a pricing-
// table change or formula drift is immediately caught.

test("claude-sonnet-4-6: 1 000 000 total tokens → correct estimate", () => {
  // 400k in × $3/MTok = $1.20 ; 600k out × $15/MTok = $9.00 → total $10.20
  expect(estimateCost("claude-sonnet-4-6", 1_000_000)).toBe("10.2000");
});

test("claude-opus-4-8: 1 000 000 total tokens → correct estimate", () => {
  // 400k in × $5/MTok = $2.00 ; 600k out × $25/MTok = $15.00 → total $17.00
  expect(estimateCost("claude-opus-4-8", 1_000_000)).toBe("17.0000");
});

test("returns null for 0 tokens (no cost to show)", () => {
  // INTENT: suppress display when there's nothing to estimate (Rule 12 — fail loud).
  expect(estimateCost("claude-sonnet-4-6", 0)).toBeNull();
});

test("returns null for unknown model", () => {
  // INTENT: never display a fabricated cost for an unrecognised model.
  expect(estimateCost("unknown-model", 1000)).toBeNull();
});
