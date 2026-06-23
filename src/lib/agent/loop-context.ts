import type { ChatMessage } from "./orchestrator";

// In-loop context management for the agentic tool-loop. As a long run accumulates
// tool results, the convo can blow past the model's window (esp. local Qwen's 16k) and
// silently truncate the final answer. We evict the OLDEST raw tool-result bytes —
// Anthropic's `clear_tool_uses` pattern: the model already reasoned over them, and if
// it needs the data again it can re-call the tool. Low-risk + reversible vs an extra
// summarizer model call inside the loop.

// Replaces an evicted tool result's content. Tri-lingual-neutral (instruction to the
// model), short so it doesn't itself consume budget.
export const CLEARED_STUB = "[tool result cleared to save context — re-call the tool if you need this data]";

export function convoChars(convo: ChatMessage[]): number {
  let n = 0;
  for (const m of convo) n += m.content?.length ?? 0;
  return n;
}

// Evict oldest role:"tool" message bodies (replace with CLEARED_STUB) when the convo's
// accumulated chars exceed budgetChars — keeping the most-recent `keepRecent` tool
// results verbatim, and NEVER touching the user message or assistant tool_call
// messages (the wire structure — assistant tool_calls ↔ tool results — must stay
// valid). Clears at least `clearAtLeast` chars per firing (anti-thrash) but always
// keeps going until under budget if evictable results remain. Pure — no I/O.
export function evictOldToolResults(
  convo: ChatMessage[],
  opts: { budgetChars: number; keepRecent?: number; clearAtLeast?: number },
): { convo: ChatMessage[]; cleared: number } {
  const keepRecent = opts.keepRecent ?? 3;
  const clearAtLeast = opts.clearAtLeast ?? 10_000;
  if (convoChars(convo) <= opts.budgetChars) return { convo, cleared: 0 };

  // Indices of tool-result messages, oldest first; protect the most recent `keepRecent`.
  const toolIdx = convo.map((m, i) => (m.role === "tool" ? i : -1)).filter((i) => i >= 0);
  const evictable = toolIdx.slice(0, Math.max(0, toolIdx.length - keepRecent));

  const next = convo.slice();
  let cleared = 0;
  for (const idx of evictable) {
    const cur = next[idx];
    const content = cur.content ?? "";
    if (content === CLEARED_STUB) continue; // already cleared — skip (idempotent)
    next[idx] = { ...cur, content: CLEARED_STUB };
    cleared += Math.max(0, content.length - CLEARED_STUB.length);
    // Stop once we're both under budget AND have cleared a meaningful chunk.
    if (convoChars(next) <= opts.budgetChars && cleared >= clearAtLeast) break;
  }
  return { convo: next, cleared };
}
