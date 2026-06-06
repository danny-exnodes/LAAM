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

## E2E results (2026-06-06, Claude-in-Chrome, dark mode, Tailscale :8443)
Ran on workflow "QA — condition branch" (5 nodes: agent→condition→agent→agent→connector).
- **G ✅** canvas Controls (+/−/fit/lock) + MiniMap render dark-themed (light icons on dark) — reported bug FIXED.
- **Item 6 ✅** MiniMap node colors match kinds (blue/orange/blue/blue/purple).
- **E ✅** "▶ Chạy thử" dry-run executed end-to-end.
- **D ✅** all 5 nodes got live green ✓ badges (succeeded→success mapping correct over SSE).
- **C ~** run-status pipeline proven (badges update live); flow animation wired (transient marching-ants not pixel-captured; run too fast).
- **item 7 ✅** condition structured form (Vế trái/Toán tử/Vế phải) + JSON↗ toggle + Copy/Delete NodeToolbar on selected node.
- **B ✅** dock toggle → float panel (draggable overlay) + dock-back.
- **F ✅** config edit → undo enables + ● dirty; undo reverts (undo→disabled, redo→enabled).
- **H ⚠ not captured** — resize_window didn't change the capture viewport; mobile sheet is implemented + unit-tested (mount/close) but not visually confirmed live.
- **D-error red edge / write-mock** — not exercised live (no failing/write node in this workflow); unit-tested.

UX findings:
1. **Condition operator hint overflows** the 288px config panel (text "op: eq|ne|…not_e…" clipped at right edge, in both docked + float). Minor — wrap/shorten.
2. Dry-run creates a normal-looking run-history entry (no "dry-run" badge — we chose not to persist a flag). Follow-up if it clutters history.
3. **A (variable autocomplete) still pending** — would directly serve the "smart input" goal for the `{{steps.a.output}}`-style fields seen in the condition form.
