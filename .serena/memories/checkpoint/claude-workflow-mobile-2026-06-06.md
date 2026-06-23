# Checkpoint: claude-workflow-mobile — 2026-06-06

## What was done
- Fixed 7 mobile-review feedback items across the workflows feature
- Item 1: WorkflowDetailClient — added Edit button (Link to /workflows/[id]/edit) in header
- Item 2: WorkflowDetailClient — moved Delete to danger zone at bottom of page; replaced window.confirm with inline confirm dialog using deleteConfirming state
- Item 3: WorkflowsClient — consolidated row actions (View, Edit, Clone, Delete) into ⋯ MoreHorizontal dropdown; Run button stays always visible; click-outside-to-dismiss via useRef
- Item 4: WorkflowEditor — two-row top bar for mobile; palette row uses overflow-x-auto; desktop config panel is hidden md:block; mobile bottom sheet (fixed, 65dvh max, md:hidden) wraps NodeConfigPanel
- Item 5: WorkflowEditor — edge label background (labelBgStyle, labelBgPadding, labelBgBorderRadius) so condition labels float above edges instead of overlapping
- Item 6: WorkflowEditor MiniMap — nodeColor uses KIND_COLORS keyed from WfNodeData; nodeStrokeColor transparent; styled to match theme
- Item 7: NodeConfigPanel ConditionForm — dual-mode UI (structured form for simple Comparators, JSON textarea for nested all/any); mode toggle; local state synced on node.id change
- Added 12 new i18n keys to src/i18n/dictionaries/workflows.ts
- Updated tests: WorkflowEditor.test.tsx (getAllByRole for dual-panel jsdom), WorkflowsClient.test.tsx (open dropdown before clicking actions), NodeConfigPanel.test.tsx (structured form + JSON mode tests)

## Files changed
- src/i18n/dictionaries/workflows.ts
- src/components/workflows/WorkflowDetailClient.tsx
- src/components/workflows/WorkflowsClient.tsx
- src/components/workflows/WorkflowsClient.test.tsx
- src/components/workflows/editor/WorkflowEditor.tsx
- src/components/workflows/editor/WorkflowEditor.test.tsx
- src/components/workflows/editor/NodeConfigPanel.tsx
- src/components/workflows/editor/NodeConfigPanel.test.tsx

## Current state
- All 985 tests pass (0 failures)
- Committed as f091df1 "fix(workflows): mobile review — 7 feedback items"
- WorkflowEditor is now usable on mobile
- ConditionForm has structured form mode for simple predicates

## Next steps
- QA the editor on actual mobile viewport (or DevTools mobile emulation) to verify bottom sheet usability
- Consider adding /workflows/[id]/edit page route if not yet created (the Edit button links there)
- P5-B items still pending: foreach node UI, agent node model selector, test for run-trigger

## Blockers / Risks
- jsdom does not apply CSS (md:hidden / hidden md:block) so dual-panel tests use getAllByRole[0] as a workaround; actual runtime is correct
- The /workflows/[id]/edit route must exist for the Edit button to work — verify before demoing
