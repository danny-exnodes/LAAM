
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
