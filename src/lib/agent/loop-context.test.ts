import { describe, expect, test } from "vitest";
import { evictOldToolResults, convoChars, CLEARED_STUB } from "./loop-context";
import type { ChatMessage } from "./orchestrator";

// Build a convo: system, user, then N (assistant tool_call -> tool result) pairs.
function convoWith(toolResults: string[]): ChatMessage[] {
  const convo: ChatMessage[] = [
    { role: "system", content: "SYS" },
    { role: "user", content: "do the thing" },
  ];
  toolResults.forEach((r, i) => {
    convo.push({ role: "assistant", content: "", tool_calls: [{ function: { name: `t${i}`, arguments: {} } }] });
    convo.push({ role: "tool", content: r });
  });
  return convo;
}

describe("evictOldToolResults — in-loop context eviction (Anthropic clear_tool_uses pattern)", () => {
  test("no-op when under budget", () => {
    const convo = convoWith(["aaa", "bbb", "ccc"]);
    const before = JSON.stringify(convo);
    const { convo: out, cleared } = evictOldToolResults(convo, { budgetChars: 100_000 });
    expect(cleared).toBe(0);
    expect(JSON.stringify(out)).toBe(before); // unchanged
  });

  test("over budget → clears OLDEST tool results, keeps the most recent `keepRecent` verbatim", () => {
    // 6 tool results of 1000 chars each = 6000 + small. Budget 3500 forces eviction.
    const big = (c: string) => c.repeat(1000);
    const convo = convoWith([big("a"), big("b"), big("c"), big("d"), big("e"), big("f")]);
    const { convo: out, cleared } = evictOldToolResults(convo, { budgetChars: 3500, keepRecent: 3, clearAtLeast: 1 });
    const toolMsgs = out.filter((m) => m.role === "tool");
    // last 3 kept verbatim
    expect(toolMsgs.slice(-3).map((m) => m.content)).toEqual([big("d"), big("e"), big("f")]);
    // oldest cleared to the stub
    expect(toolMsgs.slice(0, 3).every((m) => m.content === CLEARED_STUB)).toBe(true);
    expect(cleared).toBeGreaterThan(0);
  });

  test("never clears the user message or assistant tool_call messages (structure preserved)", () => {
    const big = "x".repeat(2000);
    const convo = convoWith([big, big, big, big]);
    const { convo: out } = evictOldToolResults(convo, { budgetChars: 100, keepRecent: 1, clearAtLeast: 1 });
    expect(out.find((m) => m.role === "user")!.content).toBe("do the thing"); // pinned
    // every assistant message still carries its tool_calls (not mutated)
    const asst = out.filter((m) => m.role === "assistant");
    expect(asst.every((m) => Array.isArray(m.tool_calls) && m.tool_calls!.length === 1)).toBe(true);
  });

  test("idempotent — re-running does not double-count already-cleared stubs", () => {
    const big = "y".repeat(1500);
    const convo = convoWith([big, big, big, big, big]);
    const first = evictOldToolResults(convo, { budgetChars: 2000, keepRecent: 2, clearAtLeast: 1 });
    const second = evictOldToolResults(first.convo, { budgetChars: 2000, keepRecent: 2, clearAtLeast: 1 });
    expect(second.cleared).toBe(0); // nothing left to clear that helps
    expect(JSON.stringify(second.convo)).toBe(JSON.stringify(first.convo));
  });

  test("stops once under budget (does not over-clear) when clearAtLeast is satisfied", () => {
    const big = (c: string) => c.repeat(1000);
    const convo = convoWith([big("a"), big("b"), big("c"), big("d"), big("e")]);
    // budget 3500, keepRecent 1 → must clear enough of the oldest to get under budget but keep what it can
    const { convo: out } = evictOldToolResults(convo, { budgetChars: 3500, keepRecent: 1, clearAtLeast: 1 });
    expect(convoChars(out)).toBeLessThanOrEqual(3500 + CLEARED_STUB.length * 5);
    // most-recent tool result is always kept verbatim
    expect(out.filter((m) => m.role === "tool").at(-1)!.content).toBe(big("e"));
  });

  test("convoChars sums content lengths across all roles", () => {
    const convo = convoWith(["ab", "cde"]);
    expect(convoChars(convo)).toBe("SYS".length + "do the thing".length + 0 + "ab".length + 0 + "cde".length);
  });
});
