# Decision: LAAM as DAAB memory consumer — pressure-test outcome + posture

**Date:** 2026-06-23 · **Role:** Technical Principal · **Status:** posture DECIDED (gates open). Pressure-tests [[ecosystem-hermes-allocation]]; supersedes the LAAM lane of [[hermes-capability-allocation]].

## Verdicts on the CTO memo's LAAM claims (grounded in code)
- **(a) kg_recall read-only, curation off the model → CONFIRMED.** Read/write is fail-closed: an MCP tool is `read` ONLY if `cfg.trustReadHints && annotations.readOnlyHint===true` (discovery.ts:50-52); else `write` → PendingWriteSignal confirm-card (policy.ts:25-30, gate.ts:50-58). writeBacked is code-derived (route.ts:646-648), Rule-13 guard keys on real tool_result (write-claim-guard.ts:80-93). **Seam:** read-only is DELEGATED to DAAB's hint × per-server trustReadHints (default FALSE, store.ts:94). LAAM cannot independently know kg_recall is read-only → never add a LAAM-side kg allowlist/heuristic; a buggy/compromised trusted DAAB mislabeling a destructive tool readOnlyHint:true WOULD be trusted.
- **(b) "index salient slice INTO DAAB" → NEEDS-REVISION (refuted as written).** latestActivity is an UNREDACTED body fragment (parser.js:71-83); only sub-agent outputText is redacted (parser.js:19-25); full raw transcript reachable via transcriptPath→getTimeline (timeline/route.ts:24-49); transcriptPath leaks host OS user + paths (sync.ts:19-22). Monitoring is ORG-SHARED, single-org, no tenant_id (read-model.ts:22-28; schema.ts:139-142) — org-shared ≠ cross-platform. **Decision: LAAM keeps a LOCAL index, exposes only pointers / the clean laam_search_sessions projection (search-sessions.ts:19-30). Raw bodies + transcriptPath NEVER into the shared graph.** Honors memo's own AAAA-deal-doc precedent (allocation.md:37,55) + RBAC gate (allocation.md:60,65,76).
- **(c) no native store / pure consumer → CONFIRMED (fact + prescription).** No native memory exists (only chat_conversation.summary/summarizedThroughId/proactiveState, per-conversation — schema.ts:234-238). MCP is fail-soft (discovery.ts:41-47; client.ts 15s timeout). Pure-consumer posture now coherent given the cloud pivot (below).
- **(d) no skill-creation / no shell-subagents → CONFIRMED (strongest precedent).** Closed tool set (registry.ts:13); zero child_process/Function/vm in agent tree; workflow node kinds frozen to 5 (types.ts:4); workflow MCP has no workflowSafe escape (blast.ts:22-28). **Make it a contract:** guard test + invariant comment.

## What the CTO missed
Unmerged loop (worktree==main commit b699352, dirty tree); 2 providers on main not 3 (byteplus.ts unmerged); summarizer PINNED to local model regardless of chat model (route.ts:336-340, fail-soft); workflows local-model-ONLY (executors.ts, hard break); 8B MCP unreliability (5 modes, [[chat-mcp-quicktools-workflow-e2e]]); per-user (chat) vs org-shared (monitoring) recall visibility split; SSE org-wide broadcast surface; the two memos contradict on native store (Rule 7).

## Cloud pivot (user, 2026-06-23, "tạm thời")
Chat → cloud (BytePlus); Qwen/local **shut off entirely**. Consequences ACCEPTED: long-convo summary goes stale (fail-soft OK); **agent-node workflows break** (local-only); connector/condition/foreach/mcp workflows survive; verify BytePlus vision. This DISSOLVES the local-first counter-argument for the chat surface → "pure consumer + best-effort fail-loud" becomes the right posture → **Phase 2 (local agent_memory-lite) DEFERRED, not built.** Restate memo's "read-only for Qwen 8B" as "read-only for the chat model, any provider."

## Plan (phased)
- **P0 (gates):** merge worktree→main (BytePlus + loop) · summarizer/workflow local-off guardrails (loud) · DAAB contract (readOnlyHint, no opaque-UUID args) · cross-platform RBAC isolation proof+test · no-skill-creation contract test.
- **P1:** kg_recall as read tool, injected as a PINNED context message (route.ts:418-423 slot, NOT evictable tool result), best-effort fail-loud. Tests: Rule-13 altered-recall, kg-write fail-closed, DAAB-down.
- **P2:** local memory-lite — DEFERRED.
- **P3:** kg_search_sessions consume + local salient index + pointer-only export + redaction layer.

**Hard deps:** DAAB RBAC-isolation proof gates ALL consumer phases.

## Update 2026-06-23 (post-merge)
P0 step 1 DONE: `worktree-byteplus-provider` merged to **main `feb279a`** (fast-forward; 2080 tests pass, tsc clean). main now HAS the run-until-done loop (`orchestrator.ts` DEFAULT_MAX_ROUNDS=25 + `loop-context.ts` eviction) and the **BytePlus provider** (3rd provider; `src/lib/llm/byteplus.ts`). The memo's "just shipped a run-until-done tool-loop" / "bounded tool-loop exists" is now factually TRUE (was unmerged at memo-time). Remaining P0: summarizer/workflow local-off guardrails (still PINNED local — route.ts:336-340 fail-soft, executors.ts hard-break), DAAB contract, RBAC-isolation proof, no-skill-creation contract test. Worktree + branch left intact (shared convention, not removed).
