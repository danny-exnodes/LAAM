# LAAM Principal → CTO: feedback on the Hermes-capability allocation (LAAM lane)

**Date:** 2026-06-23 · **From:** LAAM Technical Principal · **To:** ecosystem CTO · **Status:** 🟡 OPEN — requests corrections + 4 gate decisions.
**Full context:** [[decisions/laam-daab-consumer-posture]] (verdicts + evidence) · responds to [[decisions/ecosystem-hermes-allocation]]. This file is self-contained for the CTO.

> **TL;DR (vi):** Memo đúng về cơ chế an toàn (write-gate/Rule-13/no-skill-creation) — 3/4 claim CONFIRMED. NHƯNG: (1) **bỏ chữ "index salient slice INTO DAAB"** — LAAM giữ index LOCAL, chỉ lộ POINTER; KHÔNG đẩy transcript body vào shared graph (org-shared ≠ cross-platform, không có tenant key, latestActivity chưa redact). (2) "thin consumer" hạ thấp LAAM — LAAM **sở hữu** fail-closed gate, đó mới là thứ làm việc consume DAAB an toàn. (3) Cần DAAB chốt hợp đồng: `readOnlyHint:true` + **KHÔNG nhận arg UUID đục** từ model + chứng minh **RBAC cross-platform**. Loop+BytePlus **đã merge main `feb279a`** (2080 test xanh).

---

## 1. Executive summary
LAAM verified every load-bearing claim against its own source (file:line below, not prose). The safety thesis holds; the data-flow thesis does not. Net: **3 CONFIRMED, 1 NEEDS-REVISION**, plus 4 corrections and 4 gate-decisions LAAM needs from you before building the consumer slice.

**Reframe LAAM's lane:** not "thin consumer" but **"local-first consumer with an independent fail-closed gate."** LAAM owns the write-gate + Rule-13 guard + SSRF DNS-pin; those are exactly what make consuming an out-of-process (and not-fully-trusted) DAAB safe. The framing matters because it changes who owns the boundary.

## 2. Verdicts — verified from code
| Claim (LAAM lane) | Verdict | Evidence (LAAM source) |
|---|---|---|
| (a) consume `kg_recall`, read-only for the model, curation code-driven on DAAB (Rule 13) | **CONFIRMED** | Fail-closed kind `discovery.ts:50-52`; MCP→write unless in per-user readAllow `policy.ts:25-30`; unconfirmed write throws `gate.ts:50-58`; `writeBacked` code-derived, not LLM prose `write-claim-guard.ts:80-93`, `route.ts:646-648` |
| (b) consume `kg_search_sessions`; **index the salient slice into DAAB** | **NEEDS-REVISION** | "consume" OK; "index INTO DAAB" refuted — see §4 |
| (c) NO native memory store / pure consumer | **CONFIRMED** | Only per-conversation `summary/summarizedThroughId/proactiveState` `schema.ts:234-238`; MCP fail-soft `discovery.ts:41-47`, `client.ts:11` 15s timeout |
| (d) NO skill-creation, no shell-subagents | **CONFIRMED (strongest precedent)** | Closed tool set `registry.ts:13`; zero `child_process/Function/vm` in agent tree; workflow node-kinds frozen to 5 `workflow/types.ts:4`; workflow MCP has no `workflowSafe` escape `blast.ts:22-28` |

**Seam on (a):** "read-only" is **delegated** — an MCP tool is read-only ONLY if DAAB advertises `readOnlyHint:true` AND the user enabled per-server `trustReadHints` (default **false**, `store.ts:94`). LAAM cannot independently know `kg_recall` is read-only, and once trust is on it will trust the hint. → drives Gate #1.

## 3. Requested memo corrections (factual)
1. **"just shipped a run-until-done tool-loop" / "bounded tool-loop exists" (cap-4 skip):** was **unmerged** at memo-time (worktree draft on main's commit; main was `maxRounds=4`). **Now TRUE** — merged to main `feb279a` (run-until-done `DEFAULT_MAX_ROUNDS=25` + eviction). No change needed going forward; flag for the record that the justification only became valid 2026-06-23.
2. **"read-only for Qwen 8B"** → **"read-only for the chat model, any provider."** LAAM is **temporarily moving chat to cloud (BytePlus); local Qwen shelved.** The gate is model-agnostic, so (a)/(d) are unaffected — but the memo's 8B-specific framing is now wrong.
3. **3 providers, not "already live on 2":** BytePlus merged `feb279a` (`src/lib/llm/byteplus.ts`). The companion memo's "Ollama/Claude/BytePlus" is now accurate on main.
4. **Rule-7 conflict to resolve at ecosystem level:** `ecosystem-hermes-allocation.md:49` ("no native memory store") vs `hermes-capability-allocation.md:10` ("ADOPT-NATIVE lite"). LAAM picks **pure-consumer** (the cloud pivot removes the local-first objection); please mark the companion memo superseded. Note: a **local salient INDEX is NOT a memory store** and is still recommended for §4.

## 4. The one substantive disagreement — kg_search_sessions (claim b)
**Decision (LAAM): keep a LOCAL index of the salient metadata; expose only access-checked POINTERS to the shared graph. Raw transcript bodies + `transcriptPath` MUST NOT enter the cross-platform graph.** Grounds:
- The "salient" field is not clean metadata: `latestActivity` is built verbatim from `describeBlock()` — raw command / file_path / url / prompt — **unredacted** (`parser.js:71-83`). Only sub-agent `outputText` has a narrow regex scrub (`parser.js:19-25`); the full raw transcript is reachable via `transcriptPath → getTimeline()` unredacted (`timeline/route.ts:24-49`). `transcriptPath` leaks host OS username + project layout (`sync.ts:19-22`).
- **Org-shared ≠ cross-platform.** LAAM monitoring is org-shared (`read-model.ts:22-28`), `userId` is "provenance, NOT a visibility key" (`schema.ts:139-142`), and there is **no tenant/customer/sensitivity column** to key cross-platform isolation on.
- This honors the memo's **own** precedent (AAAA deal-doc bodies stay AAAA-local, `allocation.md:37,55`) and its **own** unmet RBAC-isolation gate (`allocation.md:60,65,76`).
- LAAM already ships the safe projection: `laam_search_sessions` returns id/project/machine/model/status/activity-label with **no body, no transcriptPath** (`search-sessions.ts:19-30`).

**Proposed wording:** *"LAAM consumes DAAB session search read-only via `kg_search_sessions`. LAAM keeps a LOCAL index of the salient metadata and exposes only access-checked session pointers to the shared graph; raw transcript bodies stay LAAM-local."*

## 5. What the memo under-weighted (highest-value)
- **No degraded-mode contract.** Recall makes local-first LAAM depend on an out-of-process DAAB; today DAAB-down = silent (discovery skips it; `executeMcp` swallows the error into a blob). **LAAM decided:** recall is **best-effort + fail-loud** (never blocks a chat answer; surfaces an honest notice).
- **Model reliability on the live DAAB MCP surface.** Qwen 8B has 5 documented failure modes against DAAB (opaque-UUID `project_id`, wrong `kg_*` variant, narrate-but-stop, hallucinated tool list — [[chat-mcp-quicktools-workflow-e2e]]). Softened by the cloud pivot, but → Gate #1 (no opaque-UUID args).
- **Per-user vs org-shared split.** Chat/agent recall is per-user-private; session search is org-shared — **opposite** visibility semantics through one DAAB RBAC model. Needs a verifiable LAAM-`userId` → DAAB-user-scope mapping; a shared org key would collapse per-user recall isolation → Gate #2.
- **SSE surface:** session metadata is already org-broadcast over SSE (`events/route.ts:74`); the index-boundary privacy decision must stay consistent with what SSE already exposes (and bodies, which are NOT on SSE, stay out of the graph).

## 6. CTO decisions LAAM needs (gates before Phase 1/2)
1. **DAAB recall-tool contract:** `kg_recall`/`kg_search_sessions` must (a) advertise `readOnlyHint:true`, (b) take **NO opaque-UUID args from the model** (resolve `project_id`/`user_id` server-side from LAAM's agent key), (c) be ≤2 unambiguous tools. Confirm.
2. **Cross-platform RBAC isolation proof** (your Open Q2): written threat model + a test that a foreign-platform key cannot read LAAM-origin nodes **AND** user A cannot recall user B's memory (per-user binding). **Gates ALL LAAM consumer phases.**
3. **Pointer-only session export accepted?** Confirm DAAB's index design can reference LAAM sessions by access-checked pointer (no body copies). 
4. **Resolve the native-store contradiction** (§3.4) at ecosystem level: LAAM = pure-consumer + local salient index. OK?

## 7. Status (LAAM side)
- ✅ Merged to main `feb279a` (fast-forward): run-until-done loop + in-loop eviction + BytePlus provider. **2080 tests pass, tsc clean.** Not pushed to origin (operator's call).
- ⏳ Pending LAAM P0 (independent of DAAB): summarizer/workflow local-off guardrails (both pinned to the now-shelved local model — `route.ts:336-340` fail-soft, `executors.ts` hard-break), no-skill-creation contract test.
- 🚧 Blocked on Gates #1–#2 before LAAM Phase 1 (`kg_recall`) / Phase 3 (`kg_search_sessions`). Phase 2 (local memory store) **deferred** per §3.4.
