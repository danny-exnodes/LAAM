# Checkpoint: cloud-first + ratified-backlog — 2026-06-23

## What was done (CTO directives 2026-06-23, no-DAAB-dependency items)
- **P0 cloud-first internal-model router** (replaces "local-off fail-loud" with the user's
  chosen *cloud-first routing*). New `src/lib/llm/internal.ts`: `resolveInternalModel()`
  (INTERNAL_MODEL → BYTEPLUS key → ANTHROPIC key → DEFAULT_CHAT_MODEL local) +
  `callModelText` / `callModelChat` / `callModelGenerate` (provider-aware). Summarizer
  (`route.ts`) + workflow agent/generate/review (`workflow/ollama.ts` now delegates) no
  longer hard-pinned to local → work when Qwen is OFF. Claude no-tool → fail-loud on
  workflow tool steps. Centralized local non-stream call in `llm/ollama.ts ollamaChat`
  (removed 3 duplicate copies).
- **P3 search**: `lib/search.ts` now matches conversations by MESSAGE CONTENT (EXISTS on
  chat_message, user-scoped, pointer-only) + **migration 0016** (pg_trgm + GIN trigram
  indexes; trigram over tsvector for vi/zh). Journal+snapshot added (0016 snapshot = 0015
  clone so db:generate stays clean).
- **P1 no-skill-creation guard**: `src/lib/agent/no-skill-creation.guard.test.ts` — scans
  agent+workflow tree for code-exec primitives (comment/string-stripped), asserts
  INTERNAL_TOOLS closed allowlist + frozen 5 workflow node kinds. Contract for D9.
- **chore**: version 2.4.1 → **2.5.0** (package.json, CLAUDE.md, CHANGELOG cut + 3 new
  subsections). `.env.example` INTERNAL_MODEL doc + corrected stale "summarize=local"
  comments. `docs/DEPLOYMENT.md` updated (BytePlus/INTERNAL_MODEL/messenger allowlists,
  migration 0016, repo path).

## Files changed
- NEW: src/lib/llm/internal.ts, src/lib/llm/internal.test.ts,
  src/lib/agent/no-skill-creation.guard.test.ts, drizzle/0016_search_trgm_indexes.sql,
  drizzle/meta/0016_snapshot.json
- EDIT: src/lib/llm/ollama.ts (+ollamaChat), src/lib/workflow/ollama.ts (delegate),
  src/app/api/chat/route.ts (summarizer→router; removed inline callModelText),
  src/app/api/chat/route.test.ts (summarize test→internal model), src/lib/search.ts,
  drizzle/meta/_journal.json, package.json, CLAUDE.md, CHANGELOG.md, .env.example,
  docs/DEPLOYMENT.md

## Current state
- **tsc --noEmit: CLEAN** (full project, run repeatedly). All changes typecheck.
- **Vitest NOT run here**: sandbox node=22 but repo requires node 24; vitest 4 native
  transformer SIGBUS-segfaults on node 22, and nodejs.org is allowlist-blocked (can't
  install node 24). New tests written (router dispatch + guard) — MUST run `npm test` on
  the node-24 host to confirm 2080+ green.
- Mount caveat: the Edit/Write tools TRUNCATE/NULL-PAD when changing existing file length
  on this D: mount — all edits done via bash heredoc/python and verified (0 nulls).

## Next steps
- USER: run `npm test` (node 24) + `npm run db:migrate` (applies 0016) on host.
- Operator: set WORKFLOW_{SLACK,WHATSAPP,ZALO}_ALLOWLIST if those workflow writes are used.
- GATED (HOLD until DAAB g2): kg_recall read tool (pinned-context inject) — do NOT start.
- Optional "world-class" follow-ups (enhancements, not bugs): chat-qa-* / workflow-qa-*
  backlogs (bulk-conv mgmt, proactive card, workflow schedule edit/cancel, live step
  progress, structured condition/foreach builders).

## Blockers / Risks
- Cannot execute the test suite in-sandbox (node version). tsc is the only automated gate here.
- BytePlus structured-output (`format`) not forwarded for workflow agent/generate → relies
  on agent-node self-repair; verify AI-generate quality on gpt-oss-120b in prod.

---

## Session 2 (same day) — "world-class" chat/workflow push → mostly ALREADY DONE
- Grounded audit of chat-qa-*/workflow-qa-* backlogs vs CODE: the 06-16 cluster review was
  right — nearly every "remaining" item is SHIPPED. Verified present in code:
  schedule toggle/delete/edit-cron (`WorkflowDetailClient` + `schedules/[id]` PATCH/DELETE),
  run cancel (`runs/[id]` PATCH action:cancel + UI), run toasts, delete-node toolbar +
  keyboard + edge relabel (`WorkflowEditor`), beforeunload unsaved guard, structured
  **ConditionForm** (left/op/right), connector/action/MCP **dropdowns** + schema-driven
  **SchemaArgsForm** (`NodeConfigPanel`). Chat FEAT/UX/F1-F4 marked done 06-05, GA per 06-16.
- **Implemented the ONE genuine open gap:** workflow step output rendered raw `<pre>` →
  now `MarkdownView` for string/agent output (digests with bold/bullets/emoji), JSON kept
  as `<pre>` (`WorkflowDetailClient` StepRow). tsc clean. Reuses existing component.
- Genuinely-remaining (minor / deferred, NOT blockers): foreach BODY still raw-JSON
  textarea (no ForeachForm builder); manual BLAST_HIGH preview/confirm (connector-write GA
  gate); ground-truth metrics injected into moat digest (vs 8B reconstructing — Rule 13).
- Stale backlog files pruned to reflect reality (workflow-qa-*).

---

## Session 3 (same day) — finished the 2 substantive remaining items
- **Digest ground-truth metrics (Rule 13):** new internal tool `laam_metrics_digest`
  (`src/lib/agent/tools/laam/metrics-digest.ts`, registered in laam index) computes
  totals/tokens/cost/stuck/top-burners in CODE + returns a verbatim `summary` block;
  pure `formatMetricsDigest` unit-tested. Updated `digest-overnight-agents` +
  `digest-judge-verify` template prompts to embed it verbatim instead of the 8B
  reconstructing numbers.
- **Foreach visual body builder:** `src/components/workflows/editor/foreach-body.ts`
  pure helpers (linearize / buildLinearGraph / nextStepId / makeStep / changeStepKind /
  moveStep) + test; `ForeachForm` (NodeConfigPanel) now offers a structured linear
  step list (reusing AgentForm/ConnectorForm/McpForm, auto-chained edges) with a
  raw-JSON fallback for branchy bodies; i18n vi/en/zh added.
- All tsc clean. NEW files: metrics-digest.ts(+test), foreach-body.ts(+test). EDIT:
  laam/index.ts, workflow/templates.ts, NodeConfigPanel.tsx, i18n/dictionaries/workflows.ts,
  WorkflowDetailClient.tsx (markdown step output, session 2), CHANGELOG.
- ⚠️ Still NOT run in-sandbox (node 24 vs 22 vitest segfault). The new foreach UI in
  particular needs a manual click-through on the host. Run `npm test` to confirm green.
