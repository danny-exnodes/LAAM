# Checkpoint: f4-parser-fix — 2026-06-12

## What was done
- Dropped `parentToolUseId` from `subAgents[]` in `parser.js` — `parent_tool_use_id` does not exist on real sidechain entries
- Removed `sidechainParentIds` Set, `hasSidechainEntries` flag, and all their collection logic
- Removed the fail-loud `console.warn` guard (false-positive on every real session with sub-agents)
- Fixed redact-before-bound order: `redactOutputText(raw).slice(0, OUTPUT_TEXT_MAX)` (was slice-then-redact)
- Kept `outputText` + `isError` — these are real and working
- Updated `parser.test.ts`: removed `parentToolUseId` assertion from test (a), removed test (c) entirely, added test (d3) for redact-before-bound contract
- Wrote backlog note to main checkout `.serena/memories/backlog/subagent-parent-link.md`
- Committed as `6a941be` on `feat/batch2`

## Files changed
- `src/lib/monitoring/parser.js` (worktree)
- `src/lib/monitoring/parser.test.ts` (worktree)
- `D:\Projects\personal_projects\LAAM\.serena\memories\backlog\subagent-parent-link.md` (main checkout, not committed)

## Current state
- All 27 monitoring tests pass
- tsc: clean
- Full suite: 261 files, 1757 tests, 0 failures

## Next steps
- None for this fix — complete

## Blockers / Risks
- None
