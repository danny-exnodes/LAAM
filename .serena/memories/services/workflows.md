
## P6/P7/P8 — Editor + AI feature wave (2026-06-08) — ALL on main, live-verified (→1306 tests, tsc clean)

3 user-feedback rounds; commit-per-feature; tests+tsc green each.

**P6 — feedback fixes:**
- **#5 canvas positions** (`c2d9e51`): `WorkflowGraph.positions` (jsonb, no migration); `capturePositions()` on save + `toReactFlow` restore; `fromReactFlow` stays position-free (serde round-trip contract).
- **#2 flow-aware vars** (`c2d9e51`): `variableSuggestions(allNodes, edges, id)` → upstream ancestors only (backward BFS); `edges` threaded to NodeConfigPanel (×3 instances).
- **#4 recurrence picker** (`852bbdd`): pure `recurrence.ts` (recurrenceToCron / cronToRecurrence→null-for-custom / defaultRecurrence / formatHHMM); `RecurrencePicker` (Hourly/Daily/Weekly/Monthly + Advanced raw-cron) wired into WorkflowDetailClient create + inline edit; list shows `describeCron` friendly text.
- **#1 schema connector forms** (`a1f93fc`) + **default-mode FIX** (`ea71d16`): `ConnectorListItem.tools` string[]→`ConnectorToolInfo[]`{name,description,parameters}; pure `schemaForm.ts` (parseArgSchema) + `SchemaArgsForm`/`ArgFieldInput`; string fields get {{var}} chips; "Advanced (JSON)" escape hatch. **QA-found bug:** defaulted to JSON because the schema loads ASYNC + `advanced` froze at mount — fixed via `defaultAdvanced` + effect dep; +async regression test (sync-prop tests masked it).

**P7 — editor UX overhaul** (ref: user images + `vercel-labs/workflow-builder-template`):
- **A1 left "Nodes Library" panel** (`a15ef2f`): `NodesLibraryPanel` show/hide/float (persisted), click+drag add (`NODE_KIND_MIME` canvas onDrop); toolbar regrouped (float/library toggles clustered by undo/redo); palette row → mobile-only.
- **A2 run waterfall** (`36a034d`): pure `waterfallLayout` (offset/width % from step startedAt/finishedAt; running→run-end; seq-sorted) + `RunWaterfall` inline in the detail run-expand.
- **A3 clickable rows + inline rename** (`480dcfb`): workflow name → Link to detail + "Đổi tên" menu → inline input → PATCH {name}.

**#3 AI assistant (create · review · edit)** — all 3 endpoints verified LIVE vs Ollama (`gemma4:e4b`). Rule 13: model proposes, code disposes (coerceGraph + assertRunnable gate; +1 self-repair retry; undoable proposals, never auto-saved/run). Spec `676f875`.
- **Generate** (`c776905`): pure `generate.ts` (buildCatalog/generationSystem/GRAPH_FORMAT/coerceGraph) + `/api/workflows/generate` (Ollama `format` structured output) + `callOllamaGenerate` + `AiGeneratePanel` "✨ Tạo bằng AI" + `applyGeneratedGraph` (snapshot→swap→fitView).
- **Review** (`434e391`): `/api/workflows/review` {graph} → callOllamaChat → VN markdown (Tóm tắt/Vấn đề/Gợi ý) via shared `MarkdownView`; "Đánh giá" button + `AiReviewPanel`.
- **Edit/refine** (`4d43e09`): `AiGeneratePanel` New|Edit toggle → {prompt, current}; `buildUserMessage` frames "edit, keep unrelated, return FULL graph". Live: original node ids preserved + requested step appended.
- UX polish: **b1** connector form shows selected tool description; **b2** recurrence next-run preview (`nextRunAt`).

**Ops note:** much of P6/P7 was committed to main via throwaway worktrees (divergence-guarded file copies) while the shared worktree sat on the other session's `feat/landing-page`; user later merged → I moved to direct main commits. The running editor dev-server bundle is STALE (beforeunload guard blocked reload) → the new AI/library UI buttons need a **hard reload** to appear; all endpoints verified live regardless.
**Remaining:** real-device mobile pass (resize tool can't reflow viewport over Tailscale).

---

## P5 Review Pass (2026-06-06) — MERGED to main, 8/8 items done + E2E verified

Spec: `docs/superpowers/specs/2026-06-06-workflow-p5-review.md`. From a mobile review of the editor; 3 phases, commit-per-phase. **1053 tests pass, tsc clean. NOT merged.**
- **Đợt 1** (a4372cd): G theme RF Controls/MiniMap (`--xy-*`→`--wf-*` override; xyflow gates dark on `.react-flow.dark` but app `.dark` is on <html>). H mobile sheet slide anim (2-flag + onTransitionEnd + scrim).
- **Đợt 2** (725151c, 176e85c): **dry-run engine** — `buildRunNode(userId,{dryRun})` mocks connector WRITES (resolveKind), reads+agents real, blast gate kept; route `/run` accepts `{dryRun}`. `useWorkflowEvents(expectedRunId?)` run filter. `nodeStatus.ts` mapStepStatus/stepsToNodeStatuses (succeeded→success, Rule 13) + edgeRunDecoration. `WorkflowEditorLive` owns SSE; editor "▶ Test" + flow-anim + red error edges.
- **Đợt 3** (61afd08, dd0d091, 77b9e37): F undo/redo (`historyStack.ts` pure: dedup/truncate/cap50; 400ms debounce; Ctrl+Z/Shift+Z; ↶↷). B panel Right+Float (localStorage, draggable float, desktop-only). A variable autocomplete (`variableHints.ts` pure + `VariableHints` chips → agent prompt / condition left-right / foreach items; allNodes threaded; insert-at-cursor) + fixed condition-hint overflow.
- **E2E ✅** Claude-in-Chrome on :8443 verified G/E/D/B/F/item6/item7 live; H not capturable via resize tool (unit-tested). UX finding (operator hint overflow) fixed.
- Fixed stale memory `v2-dark-mode-theming` (app IS class-based `.dark`).
- **Defer:** agent model selector (engine A0 ignores `model`) + connector-args schema form (no per-tool arg schema yet). Dry-run lacks a run-history badge (chose not to persist a flag).

## P5 Roadmap (2026-06-06) — Approved, Implementation Started

Full spec: `docs/superpowers/specs/2026-06-06-workflow-p5-roadmap.md`

**P5-A (Sprint 1 — COMPLETE, 2026-06-06):** Items 8+9+4+7
- Item 8: Handle size: `workflow-editor.css` `.react-flow__handle` → 16×16px; hover accent
- Item 9: CSS vars: `--wf-node-bg/text/border/id-text/edge-stroke` in `:root` + `.dark`, WfNodeCard inline styles replaced
- Item 4: `DEFAULT_EDGE_OPTIONS` (MarkerType.ArrowClosed, CSS var stroke); loaded edges merged; onConnect branches spread options
- Item 7: `NodeToolbar` on selected node; Copy (`handleCopyNode` +32/+32 offset, new UUID) + Delete; `actionsRef` pattern (stable useRef, wired after callbacks)
- Groundwork: `WfNodeData` type, `nodeStatuses` prop, status badge (P5-C run-in-editor)
- Tests: 15 tests in WorkflowEditor.test.tsx; ReactFlow mock extended with nodeTypes + mockSelectedId

Known deferred items for P5-B:
- `wf.node.copyNodeLabel` + `wf.node.deleteNodeLabel` NOT yet used in NodeToolbar (hardcoded English) — requires `useT` in WfNodeCard
- Status badge render (nodeStatuses) has no unit test — add in P5-B test pass
- `WfNodeCard.tsx` NOT yet extracted from WorkflowEditor.tsx (still one large file)

**P5-B (Sprint 2 — pending):** Items 5, 3, 2, 10 + above deferred items
**P5-C (Sprint 3 — pending):** Items 6, 1

---

## P4 Feature Upgrades (2026-06-06)

**New API route:** `src/app/api/workflows/schedules/[id]/route.ts`
- DELETE (ownership-checked, 204)
- PATCH (enabled toggle OR cron update with recalc, 400 guards)

**Schedule UI:** WorkflowDetailClient has toggle/delete/inline-cron-edit per row.
Cron edit: click cell → input → Enter/blur saves, Escape cancels.
Double-PATCH prevented via e.preventDefault() on Enter.

**Node delete:** NodeConfigPanel has onDelete? prop + Trash2 button.
WorkflowEditor document keydown handler fires on Delete/Backspace when selectedId set.

**Dirty guard:** isDirty via loadedRef (no false dirty on initial load).
DATA_CHANGE_TYPES filter avoids false dirty on RF select/dimensions events.
● dot on Save, beforeunload guard, confirm dialog on back navigation.

**Connector picker:** NodeConfigPanel fetches /api/connectors on mount.
ConnectorForm shows <select> when list non-empty, <input> fallback when empty.
noTools hint when connector selected but tools:[].
Test injection: connectors? prop + useRef(connectorsProp !== undefined) mount gate.
