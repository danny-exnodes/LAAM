# Backlog: sub-agent tree link + output rendering (F4 follow-through)

**Origin:** batch2 F4 (claude-runtime parser augment). Referenced from
`src/lib/monitoring/parser.js` and `src/app/agents/[id]/page.tsx`.

## 1. Parent→child tree link was DROPPED (do NOT reintroduce `parent_tool_use_id`)

F4 originally tried to build a sub-agent tree via `parentToolUseId`, reading a
`parent_tool_use_id` field off transcript entries. **That field does not exist**
on real sidechain entries — the F4 review caught it: the link never populated and
the fail-loud version guard produced false positives.

**Real fields on sidechain entries:** `parentUuid` (the spawning message's uuid)
and `agentId`. A correct tree must walk `parentUuid` back to the Task tool_use that
spawned the sidechain, NOT invent a `parent_tool_use_id`. Until that walk is built
and verified against real transcripts, sub-agents stay a **flat list** (current
behaviour). Do not add tree nesting on an unverified field.

## 2. Rich `outputText` rendering (DEFERRED — captured but not fully rendered)

F4's scope was locked to the **parser augment only** (capture
`outputText` + `isError`, redact-before-bound, ≤500 chars). The data lands in
`agent_sessions.subAgents` jsonb (org-broadcast via SSE).

**Done in batch2:** `SubAgentJson` now types `isError?` + `outputText?`; the detail
page (`agents/[id]/page.tsx`) renders a **red status dot** when `isError` is true
(failed sub-agent visible at a glance).

**Still deferred:** an expandable per-sub-agent output panel showing the captured
`outputText` (truncated with expand, monospace, error-styled when `isError`). It's
purely presentational — the data is already persisted, typed, and redaction-safe.
Pick this up when the sub-agent tree work (item 1) is tackled, so the tree + output
ship as one coherent "nicer sub-agent view" rather than two partial passes.

## Files
- `src/lib/monitoring/parser.js` — emits `isError` + `outputText` per sub-agent.
- `src/db/schema.ts` — `SubAgentJson` (optional `isError`/`outputText`).
- `src/app/agents/[id]/page.tsx` — flat list + red dot; output panel = TODO here.
