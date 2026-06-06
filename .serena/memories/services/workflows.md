
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
