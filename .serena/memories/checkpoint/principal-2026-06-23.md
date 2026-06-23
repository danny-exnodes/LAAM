# Checkpoint: principal (DAAB-consumer pressure-test) — 2026-06-23

## What was done
- Adversarially pressure-tested the CTO memo (ecosystem-hermes-allocation.md) casting LAAM as a thin DAAB memory consumer. Verdicts: (a) CONFIRMED, (b) NEEDS-REVISION, (c) CONFIRMED, (d) CONFIRMED.
- Verified 9 load-bearing files first-hand + a 10-agent workflow for breadth. Recorded decision: decisions/laam-daab-consumer-posture.md.
- Captured user pivot (temporary): chat→cloud BytePlus, Qwen/local SHUT OFF entirely; recall = best-effort fail-loud.

## Files changed
- NEW .serena/memories/decisions/laam-daab-consumer-posture.md
- NEW .serena/checkpoint/principal-2026-06-23.md
- EDIT .serena/memories/INDEX.md (decision pointer)
- (analysis only — no source code changed)

## Current state (verified facts)
- **MERGED to main `feb279a`** (fast-forward; 2080 tests pass, tsc clean): run-until-done loop (orchestrator.ts DEFAULT_MAX_ROUNDS=25 + loop-context.ts eviction) + BytePlus provider (src/lib/llm/byteplus.ts). main was maxRounds=4 / 2 providers BEFORE this session's merge. Worktree-byteplus-provider + branch left intact (shared convention).
- Summarizer pinned to local model (route.ts:336-340, fail-soft); workflows local-model-only (executors.ts) → break with local off (agent nodes only).
- MCP read/write fail-closed (discovery.ts:50-52, policy.ts:25-30); trustReadHints default false (store.ts:94); client 15s timeout + SSRF DNS-pin (client.ts).
- Monitoring ORG-SHARED, no tenant key, latestActivity unredacted (parser.js:71-83); laam_search_sessions is the clean shareable projection.

## Next steps
- P0: merge worktree→main; add summarizer/workflow local-off guardrails (fail-loud); get DAAB contract (readOnlyHint + no opaque-UUID args) + cross-platform RBAC isolation proof.
- Then P1 kg_recall read tool (pinned-context injection, fail-loud). P3 kg_search_sessions + local index + pointer-only. P2 deferred.

## Blockers / Risks
- DAAB internals + RBAC-isolation UNVERIFIED (memo Open Qs 1,2) — gate all consumer phases.
- Shutting local off breaks agent-node workflows + stales long-convo summaries until guardrails/unpin land.
- Rule-7 conflict: hermes-capability-allocation.md:10 (ADOPT-NATIVE lite) superseded by pure-consumer posture — annotate that memo.
