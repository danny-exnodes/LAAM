# Checkpoint: claude-workflow-p5 — 2026-06-06

Branch: `feat/workflow-p5-review` (off main 759c8b2). Spec: `docs/superpowers/specs/2026-06-06-workflow-p5-review.md`.

## What was done (P5 review pass — 7 of 8 buildable items)
- **Đợt 1** (a4372cd): G — theme RF Controls/MiniMap via `--xy-*`→`--wf-*` override (root cause: xyflow gates dark on `.react-flow.dark`, app uses `.dark` on <html>). H — mobile config sheet slide animation (2-flag mount/open + onTransitionEnd + scrim).
- **Đợt 2** (725151c + 176e85c): dry-run engine (mock connector WRITES via resolveKind; reads+agents real; blast gate kept) threaded route→executeRun→RunRow→buildRunNode. useWorkflowEvents(expectedRunId?) filter. mapStepStatus/stepsToNodeStatuses (Rule 13). Editor "▶ Test" (save-if-dirty→dry-run→onTestRun); WorkflowEditorLive owns SSE. Edge flow animation + red error edges (edgeRunDecoration).
- **Đợt 3** (61afd08 + dd0d091): F — undo/redo (pure historyStack: dedup/truncate/cap50; 400ms debounce snapshot; Ctrl/Cmd+Z / +Shift+Z; toolbar ↶↷). B — panel Right+Float dock (localStorage, top-bar toggle, draggable float overlay; desktop-only).
- docs (e2c7206): spec + fixed stale `v2-dark-mode-theming` memory (app IS class-based) + relocated mis-pathed mobile checkpoint.

## Files changed (all committed)
workflow-editor.css; WorkflowEditor.tsx(+test); WorkflowEditorLive.tsx; nodeStatus.ts(+test); historyStack.ts(+test); useWorkflowEvents.ts(+test); lib/workflow/{runtime,run}.ts(+tests); api/workflows/[id]/run/route.ts; app/workflows/[id]/edit/page.tsx; i18n/dictionaries/workflows.ts.

## Current state
- 5 feature commits + 1 docs commit on the branch. **1053 tests pass, tsc clean.** NOT pushed, NOT merged.
- Visual items (G control colors, H/mobile anim, C flow anim, D error edges) need **E2E confirmation** — code-correct, not eyeballed.

## Next steps
- **A (Đợt 3, item #13) — REMAINING:** variable autocomplete `{{steps.<id>.output}}`/`{{trigger}}`/`{{vars}}` from sibling nodes. Plan: pure `variableSuggestions(allNodes,currentId)` + thread `allNodes` WorkflowEditor→NodeConfigPanel (3 instances: right/float/mobile)→forms + insert-at-cursor chips on 5 text fields (agent prompt/system, condition left/right, foreach items; skip connector args = JSON). Defer model selector + args-schema (engine A0 ignores model; no per-tool arg schema).
- **I (E2E) — BLOCKED:** dev server down (:3100/:8443). When user starts it, run Claude-in-Chrome to verify G/H/C/D + capture UX findings.

## Blockers / Risks
- **Concurrent agent active in this working tree** (WDK-research docs/memories appeared/moved mid-session). Mitigated: separate branch + explicit-path commits only; never staged INDEX.md (holds their change) or their files. Verify branch before each commit.
- INDEX.md entry for the P5-review spec NOT added (avoided touching the cross-agent-modified file). Add once their work settles.
