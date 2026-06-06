# Checkpoint: main-agent — 2026-06-06

## What was done

### P5-A Workflow Editor Quick Wins (Items 8+9+4+7)
- **Task 1**: Created `workflow-editor.css` — CSS vars `:root`/`.dark` for node/edge theming + 16×16px handle override + toolbar button styles
- **Task 2**: Applied CSS vars to `WfNodeCard` inline styles (dark mode now correct)
- **Task 3**: `DEFAULT_EDGE_OPTIONS` (MarkerType.ArrowClosed + CSS var stroke) on all edges; load/connect/onConnect all use defaults
- **Task 4**: `WfNodeData` / `NodeActions` types; `actionsRef` stable ref pattern; `nodeStatuses` prop; status badge (P5-C groundwork); `nodesWithStatus` memo
- **Task 5**: `NodeToolbar` with Copy + Delete buttons on selected node; `handleCopyNode` (+32/+32 offset, new UUID); nodeActionsRef wired each render
- **Task 6**: Extended ReactFlow mock with `nodeTypes` + selection tracking; 2 toolbar tests added (15 total in editor tests); `data-testid="toolbar-delete"` for stable selector
- Fixed: `vitest.config.ts` excludes `.claude/**` worktrees to prevent multi-React errors
- i18n: `wf.node.copyNodeLabel` added to workflows.ts

### Mobile Navigation Update
- `bottom-nav.tsx`: Replaced Reliability tab with Workflows (GitBranch icon)
- `SettingsMenu.tsx`: Added Reliability row in Servers card → `/eval`
- `settings.ts` i18n: Added `settings.reliability.label` + `settings.reliability.desc` (vi/en/zh)

## Files changed
- `src/components/workflows/editor/workflow-editor.css` (NEW)
- `src/components/workflows/editor/WorkflowEditor.tsx`
- `src/components/workflows/editor/WorkflowEditor.test.tsx`
- `src/i18n/dictionaries/workflows.ts`
- `src/i18n/dictionaries/settings.ts`
- `src/components/bottom-nav.tsx`
- `src/components/settings/SettingsMenu.tsx`
- `vitest.config.ts`

## Current state
- All on `main` branch
- 922 tests passing (151 files)
- Desktop nav: already had Workflows
- Mobile nav: Dashboard · Agents · Workflows · Chat (center) · Connectors · Settings
- Reliability (/eval) accessible via Settings → Servers card on mobile

## Next steps
- **P5-B (Sprint 2)**: Items 5 (error state badges), 3 (panel float), 2 (smart inputs), 10 (undo/redo)
- Deferred from P5-A: wire `wf.node.copyNodeLabel`/`deleteNodeLabel` i18n in NodeToolbar (requires `useT` in WfNodeCard), status badge unit test

## Blockers / Risks
- None. `feat/connectors-oauth-expansion` branch work (OAuth, connectors expansion) still has uncommitted working-tree changes that are not yet committed — those are a separate feature in progress.
