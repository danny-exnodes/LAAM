# Checkpoint: claude-chat-f1 — 2026-06-06

## What was done
- Fixed **QA F1 (HIGH)**: local model (qwen3-vl:8b) confabulates a WRITE success
  ("đã tạo thành công") without emitting the tool_call → user falsely told a write
  happened. Branch `fix/f1-write-confabulation-guard` (off `main`, NOT committed).
- **Root cause (confirmed in code):** in the main turn a real write ALWAYS suspends
  (`PendingWriteSignal` in `withSafety`/gate.ts) before executing; the actual write
  runs only in `handleConfirm`→`streamOllama`. So any "write succeeded" claim in the
  `streamMainTurn` streamed completion is provably unbacked (Rule 13).
- **Fix (server-only, no FE/frames.ts/components touch):**
  1. New pure module `safety/write-claim-guard.ts` (+test, 15 cases): `looksLikeWriteIntent`,
     `assertsCompletedWrite` (vi/en/zh, anchored on completion markers đã/vừa/được…thành
     công/rồi/已), `guardWriteClaim`, tri-lingual `SAFE_UNBACKED_WRITE`.
  2. Wired into `streamMainTurn`: write-intent turns BUFFER the completion (withhold
     live tokens) → vet via `guardWriteClaim` → replace unbacked success with honest
     message before emit + persist. Reads/chat stream live unchanged.
  3. Hardened `buildSystemPrompt` (context.ts): force tool-use for write intents +
     forbid unbacked success claims (with-tools branch only).
- **Phase 6 review** (subagent): 0 Critical; 2 Important fixed (FP on purpose/well-wish
  "…thành công"; FN on vừa/rồi) + 2 Minor (intent uses `titleHint` not attachment-laden
  `message`; `console.warn` on block). Regression tests added for all.

## Files changed (mine only — did NOT touch INDEX.md or other sessions' files)
- NEW `src/lib/agent/safety/write-claim-guard.ts` (+ `.test.ts`)
- `src/app/api/chat/route.ts` (streamMainTurn: buffer+guard; intentText)
- `src/lib/agent/context.ts` (+ `.test.ts`) — write-forcing directive

## Current state
- ✅ `npm test` 1075/1075 (169 files); `npx tsc --noEmit` exit 0.
- Good path intact: model calls write tool → PendingWriteSignal → confirm-card (unchanged).
  Reads + `gmail_send` confirm→execute (handleConfirm/streamOllama) untouched.
- ⏳ NOT committed; NOT live-E2E'd (needs user host: real Ollama+Google).

## Next steps
- User: review diff, commit/merge `fix/f1-write-confabulation-guard`; live-verify the
  Calendar-create prompt (expect confirm-card OR honest "chưa thực hiện được", never fake success).
- F2 (trace/citation inconsistent across turns) + F3 (OAuth Internal) still open — see backlog.

## Blockers / Risks
- Heuristic regexes (recall-biased): residual narrow FP on "tạo danh sách rồi." (text-gen
  on a write-keyword turn) → costs only the safe message; residual FN on unanticipated
  phrasings → falls back to old behavior (reduced by the system-prompt directive).
- Repo has parallel worktrees/sessions; F2 touches `components/chat/*` (contended) → defer/coordinate.
