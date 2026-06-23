# Backlog — CTO directives (2026-06-23 platform review)

> Tracking items from the CTO review `mem:global/ecosystem/cto-review-2026-06-23`. Contract: `mem:global/ecosystem/shared-memory-contract` · LAAM plan: `mem:global/ecosystem/laam-plan`. Delete items as completed.

## Now — no DAAB dependency  ✅ ALL DONE 2026-06-23 (`checkpoint/cloud-first-2026-06-23`)
- [x] **P0 Merge PR#9** — already merged to main (`ab3753c`). ⚠️ Operator action remains: set `WORKFLOW_{SLACK,WHATSAPP,ZALO}_ALLOWLIST` (fail-closed by default until set).
- [x] **P0 Local-off guardrails** — shipped as **cloud-first routing** (user choice over literal fail-loud): summarizer + workflow agent/generate/review route via `src/lib/llm/internal.ts` `resolveInternalModel()` → work when local Qwen is off; local-only deploys keep the $0 path. +router tests.
- [x] **P1 No-skill-creation guard** — `src/lib/agent/no-skill-creation.guard.test.ts`: code-exec scan (child_process/eval/Function/vm/spawn) + closed INTERNAL_TOOLS allowlist + frozen 5 node kinds.
- [x] **P3 session/chat search** — `lib/search.ts` matches message CONTENT (EXISTS, pointer-only) + migration **0016** (pg_trgm GIN; trigram over tsvector for vi/zh). `laam_search_sessions` gains the GIN index.
- [x] **chore version** — 2.4.1 → **2.5.0** (package.json/CLAUDE.md/CHANGELOG cut); `.env.example` INTERNAL_MODEL + `docs/DEPLOYMENT.md` updated.
- ⚠️ **NOT verified in-sandbox**: full `npm test` (node-24 only; sandbox node-22 segfaults vitest). Run on host.

## Gated — HOLD until DAAB **gate g2**
- [ ] **P1** Wire `kg_recall` read tool via the existing MCP client — inject as a **PINNED context message** (not an evictable tool result); best-effort fail-loud. Tests: Rule-13 altered-recall, kg-write fail-closed, DAAB-down degraded path. Requires DAAB `readOnlyHint=true` (D7).

## Ratified (CTO calls)
- **Pure-consumer posture** (D11): NO native shared memory store; keep a LOCAL index + pointer-only export; raw transcripts / `transcriptPath` NEVER into the shared graph. `hermes-capability-allocation` #1 (ADOPT-NATIVE lite) is **SUPERSEDED** — annotate that memo.
- `kg_search_sessions` **descoped** from the shared seam (D4) — LAAM session search stays LOCAL.
