# Backlog — CTO directives (2026-06-23 platform review)

> Tracking items from the CTO review `mem:global/ecosystem/cto-review-2026-06-23`. Contract: `mem:global/ecosystem/shared-memory-contract` · LAAM plan: `mem:global/ecosystem/laam-plan`. Delete items as completed.

## Now — no DAAB dependency (start immediately)
- [ ] **P0** **Merge PR#9** (security hardening: recipient-gate format-aware + SSRF DNS-pin + per-user HKDF + defense-in-depth). CTO-approved (D12; sign-off 2026-06-16, adversarially verified, 2037 tests green). Then set `WORKFLOW_{SLACK,WHATSAPP,ZALO}_ALLOWLIST` (operator action; fail-closed by default).
- [ ] **P0** **Local-off guardrails (fail-loud)** for summarizer + agent-node workflows — cloud pivot (Qwen off) broke them (`route.ts:336-340` fail-soft, `executors.ts` hard-break).
- [ ] **P1** **No-skill-creation guard test** + invariant comment (security invariant, D9; LAAM is the ecosystem's strongest precedent).
- [ ] **P3** **Local session search** — upgrade `laam_search_sessions` + `/api/search` from ILIKE-title → **tsvector + pg_trgm GIN** on `chat_message.content`. Keep pointer-only export.
- [ ] **chore** Reconcile CLAUDE.md version drift (claims v2.0.0; `package.json` = v2.4.1+) + CHANGELOG `[Unreleased]`.

## Gated — HOLD until DAAB **gate g2**
- [ ] **P1** Wire `kg_recall` read tool via the existing MCP client — inject as a **PINNED context message** (not an evictable tool result); best-effort fail-loud. Tests: Rule-13 altered-recall, kg-write fail-closed, DAAB-down degraded path. Requires DAAB `readOnlyHint=true` (D7).

## Ratified (CTO calls)
- **Pure-consumer posture** (D11): NO native shared memory store; keep a LOCAL index + pointer-only export; raw transcripts / `transcriptPath` NEVER into the shared graph. `hermes-capability-allocation` #1 (ADOPT-NATIVE lite) is **SUPERSEDED** — annotate that memo.
- `kg_search_sessions` **descoped** from the shared seam (D4) — LAAM session search stays LOCAL.
