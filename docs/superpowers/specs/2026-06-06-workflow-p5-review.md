# Workflow Editor — P5 Review Pass (Design Spec)

**Date:** 2026-06-06
**Status:** Approved (QA ↔ Tech Lead debate + user sign-off; user authorized run-to-completion)
**Branch:** `feat/workflow-p5-review`
**Scope:** 9 review-feedback items completing P5-B/P5-C + 2 new bugs (G, H) + 1 process item (I).

This spec supersedes the phasing in `2026-06-06-workflow-p5-roadmap.md` for the
remaining (P5-B/C) items, reusing its already-shipped P5-A groundwork
(CSS vars, `WfNodeData`, `actionsRef`, `nodeStatuses` prop, NodeToolbar).

---

## Locked decisions (from user Q&A, 2026-06-06)

1. **Phasing:** 3 phases, commit + summary at each boundary.
2. **Editor run = dry-run only.** Real run stays on the detail page.
3. **Dry-run semantics (LAAM-specific):** execute agents + connector **reads** for real
   (local model = $0, so no reason to mock them), **mock connector writes** only
   (return synthetic `{ dryRun:true, wouldHaveCalled, args }` so downstream still flows).
   Bypasses the SP-2 write confirm-card (nothing real is written). One `dryRun` flag
   threaded into the engine; reuses run record + SSE + step persistence.
4. **Config panel dock scope = Right (default) + Float (draggable overlay).**
   No Left/Bottom/Stick (user chose minimal over the originally-listed 5 modes).
5. **Defer:** agent `model` selector (engine A0 ignores `model` → dead config) and
   connector-args schema form (no per-tool arg schema exists yet). Item A delivers a
   **variable-autocomplete** helper instead — the highest-leverage shared win.
6. **E2E (item I): deferred to the end** — run after code lands and the user starts the
   dev server (`:3100`), since server is currently down and agents must not start it.

---

## Phase 1 — Pure UI (no run dependency)

### G — Canvas control buttons wrong colors
- **Root cause:** no `.react-flow__controls*` override exists; `<Controls>` uses the
  library default stylesheet (light-only). `<MiniMap>` got inline theming, `<Controls>` did not.
- **Decision:** add overrides to `workflow-editor.css`:
  - `.react-flow__controls-button` → `background: var(--wf-node-bg)`, `border-color: var(--wf-node-border)`,
    `color: var(--wf-node-text)`, SVG `fill: currentColor`; hover → `--color-accent`.
  - `.react-flow__minimap-mask` → fill tuned for light/dark via vars.
- **Files:** `workflow-editor.css`. **Verify:** visual (E2E, phase I).

### H — Mobile config sheet has no open/close animation
- **Decision:** 2-flag pattern in `WorkflowEditor.tsx`:
  - `sheetMounted` (in DOM) + `sheetOpen` (transform). Open: mount → next frame `translate-y-0`.
    Close: `translate-y-full` → `onTransitionEnd` unmounts.
  - Add a tap-to-dismiss **scrim** backdrop (`bg-black/30`, `md:hidden`).
  - Tailwind `transition-transform duration-300 ease-out`. No lib, no swipe (YAGNI).
- **Files:** `WorkflowEditor.tsx`. **Verify:** unit (mount on select, exit flips state) + E2E.

---

## Phase 2 — Live run observability (E + C + D as one unit)

These share the run-status pipeline; building them separately would mean half-wiring it.

### Engine — dry-run flag
- Thread `dryRun?: boolean` from run trigger into the executor. Where a connector
  **write** tool would execute, short-circuit to a synthetic success output
  (`{ dryRun: true, wouldHaveCalled: "<connectorId>.<action>", args }`) and emit the
  normal step record (status `succeeded`). Reads + agents run normally.
- Classify write vs read via the existing connector registry `kind` (per
  `connectors-oauth` decision — policy derived from registry, not a hardcoded list).
- **Files:** `src/lib/workflow/*` (executor + run). Exact files pinned in the plan.

### API — `/run` accepts dry-run
- `POST /api/workflows/[id]/run` accepts `{ dryRun?: boolean }`; passes it into the run.
  Returns the `runId` (already does, or add). **Files:** `src/app/api/workflows/[id]/run/route.ts`.

### Hook — filter by runId
- `useWorkflowEvents(expectedRunId?: string)`: when set, ignore events for other runIds
  (closes cross-run contamination — another scheduled run won't paint the editor).
  Keep current "most recent" behavior when arg omitted. **Files:** `useWorkflowEvents.ts`.

### Status mapping (Rule 13)
- SSE emits `running | succeeded | failed`; node badge wants `idle | running | success | error`.
  Pure map `mapStepStatus`: `succeeded→success`, `failed→error`, `running→running`, else `idle`.
  **Unit test** with the real SSE vocabulary (never trust look-alike strings).

### Editor wiring (E + C + D)
- Editor page: call `useWorkflowEvents(activeRunId)`, fold `steps[]` → `nodeStatuses`
  via `mapStepStatus`, pass to `<WorkflowEditor nodeStatuses>`.
- **E:** "▶ Test" button in the top bar → save-if-dirty → `POST /run {dryRun:true}` → track
  returned runId. Toast/inline status.
- **C (flow animation):** edge `animated: true` ONLY while `runStatus==="running"` AND the
  edge's source node status is `running`/`success` (flow lights up as it advances), else static.
- **D (error state):** node badge already renders (`✕` on error); add **edge turns red**
  when its source node status is `error`. Runtime errors only.
- **Files:** `src/app/workflows/[id]/edit/page.tsx`, `WorkflowEditor.tsx`.
- **Out of scope:** static per-node validation surfacing (`assertRunnable` by nodeId) → backlog.

---

## Phase 3 — Editing power (no run dependency)

### F — Undo / Redo
- `historyStack: {nodes, edges}[]` (max 50) + `pointer`. Push:
  - **structural changes immediately** (add/remove/connect; position only on **drag-end**,
    i.e. `position` change with `dragging===false`),
  - **config/text changes debounced 500ms** (so Ctrl+Z undoes typing too, without per-keystroke spam).
- Keyboard `Ctrl/Cmd+Z` undo, `Ctrl/Cmd+Shift+Z` redo (ignore when focus is in input/textarea/select).
- Toolbar ←/→ buttons, disabled at stack bounds.
- **Files:** `WorkflowEditor.tsx`. **Verify:** unit (push boundaries, undo/redo restores).

### A — Variable autocomplete (smart input)
- Shared helper suggesting `{{steps.<siblingId>.output}}`, `{{trigger.*}}`, `{{vars.*}}`
  built from sibling node ids (`allNodes` passed WorkflowEditor → NodeConfigPanel).
- Wired into the `{{...}}`-sink fields: agent prompt/system, condition left/right,
  connector args, foreach items. Trigger on `{{` or a small "insert variable" affordance.
- **Files:** new `VariableAutocomplete.tsx` (or `useVariableHints` hook) + `NodeConfigPanel.tsx`
  (+ pass `allNodes` from `WorkflowEditor.tsx`). **Verify:** unit (suggestions from siblings, insert).
- **Deferred (not built):** agent model selector, connector-args schema form (see decision 5).

### B — Panel Right + Float
- `panelMode: "right" | "float"` (default `right`), toggle button in panel header,
  persisted to `localStorage('wf-panel-mode')`. Float = draggable overlay (mousedown delta).
  Desktop-only (`md:` — mobile keeps the bottom sheet). Shows only when a node is selected.
- **Files:** `WorkflowEditor.tsx` + `NodeConfigPanel.tsx`. **Verify:** unit (toggle, persist, drag state).

---

## Phase I — E2E (deferred)
- After phases 1–3 land and the user starts the dev server, run Claude-in-Chrome E2E to
  verify the visual items (G, H, C, D) and capture any further UI/UX findings.

---

## Housekeeping
- **Fix stale memory** `decisions/v2-dark-mode-theming.md`: the project now uses **class-based**
  dark mode (`@custom-variant dark (&:where(.dark, .dark *))` in `globals.css`), so `.dark .x`
  CSS is **live, not dead**. The old "media-query only" note misleads.

## Conflict isolation
- Work on `feat/workflow-p5-review`; commit with **explicit paths only** (never `git add -A`)
  to avoid the concurrent WDK-research uncommitted files and `INDEX.md` (another session's).
- Other active worktrees (`feat/harness-eval`, `infra/docker-stack`) touch unrelated areas.

## i18n
- New user-facing strings (Test button, undo/redo titles, panel toggle, variable hints,
  dry-run badge) → add vi/en/zh keys to `src/i18n/dictionaries/workflows.ts`.
