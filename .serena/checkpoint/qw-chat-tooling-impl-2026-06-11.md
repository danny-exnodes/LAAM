# Checkpoint: qw-chat-tooling-impl — 2026-06-11

## What was done
- QW-1 (prompt grouping): `buildSystemPrompt` now renders read vs write tools as two labelled groups
  ("Công cụ ĐỌC …" / "Công cụ GHI …") to fight position-bias on the flat ~47-tool prompt.
- QW-1 (registry): `modelToolSchemas` stable-sorts kind="write" before kind="read" (schema content
  unchanged, dispatch is by name).
- QW-5 (few-shot): added a 1-line write-flow example using ONLY `demo_create_task` (never a real
  connector — honours connector-write-safety memory).
- Signature change: `buildSystemPrompt({...toolNames: string[]})` → `tools: {name,kind}[] | string[]`
  (string[] kept for back-compat, treated as read).

## Files changed
- src/lib/agent/context.ts — new signature, grouped render, few-shot, back-compat normalize.
- src/lib/agent/registry.ts — write-first stable sort in modelToolSchemas.
- src/lib/agent/context.test.ts — rewrote 4 cases + added back-compat + few-shot assertions (6 total).
- src/lib/agent/registry.test.ts — added write-first ordering test.
- src/app/api/chat/route.ts — 2 caller sites updated to new shape (line ~270 passes {name,kind}; resume path passes []).
- scripts/eval/runner.ts — 5th caller (eval harness) updated to {name,kind} so eval measures prod prompt.

## Current state
- tsc --noEmit clean. Targeted tests green: context+registry (10), route+workflow (259),
  eval+full agent module (200). No regressions.
- runtime.ts NOT a buildSystemPrompt caller (only modelToolSchemas); all INTERNAL_TOOLS are read,
  so write-first sort leaves their order unchanged → workflow read-only path unaffected.

## Next steps
- None for this task. (Other QW tasks per the multi-step web chain / prompt-flattening live elsewhere.)

## Blockers / Risks
- LOW. Grouped prompt wording is new VN UX string — natural, reviewed. No commit/push done (per constraints).
