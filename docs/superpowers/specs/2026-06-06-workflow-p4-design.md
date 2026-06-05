# Design: Workflow P4 Feature Upgrades

**Date:** 2026-06-06  
**Status:** Approved  
**Scope:** 4 items from QA feature-upgrade backlog (A, B, C, D)  
**Files touched:** WorkflowEditor.tsx, NodeConfigPanel.tsx, WorkflowDetailClient.tsx, new API route, i18n dict

---

## Items in scope

| ID | Feature | Complexity |
|----|---------|-----------|
| A | Schedule management (delete / toggle / inline cron edit) | Medium |
| B | Editor — node/edge delete UI affordance | Small |
| C | Editor — unsaved changes guard | Small |
| D | Editor — connector/action picker (dropdown from API) | Medium |

---

## A — Schedule Management

### Goal
Make the schedule table in `WorkflowDetailClient` fully manageable: users can delete schedules, toggle enabled/disabled, and edit the cron expression without leaving the page.

### Backend

New file: `src/app/api/workflows/schedules/[id]/route.ts`

**DELETE `/api/workflows/schedules/[id]`**
- Auth → ownership check (`userId` match on schedule row)
- `db.delete(workflowSchedules).where(eq(...id))` — DB schema has `onDelete: "set null"` on `workflowRun.scheduleId`, so existing run history is preserved
- Returns 204

**PATCH `/api/workflows/schedules/[id]`**
- Auth → ownership check
- Accepted fields: `enabled?: boolean`, `cron?: string`
- If `cron` provided: validate with `parseCron()`, recalculate `nextRunAt = cronNext(cron, new Date())`
- `db.update(workflowSchedules).set(patch)` — partial update, only set provided fields
- Returns updated schedule row (200)

### Frontend (`WorkflowDetailClient.tsx`)

Schedule table row changes:
- **Toggle button** (`Power` icon, 15px): calls PATCH `{ enabled: !s.enabled }`, optimistic toggle + re-fetch on response
- **Delete button** (`Trash2` icon): `window.confirm` → DELETE → remove from local state
- **Inline cron edit**: `cronEditId` state tracks which row is editing; click cron cell → `<input type="text" defaultValue={s.cron}` → `onBlur`/`Enter` → PATCH `{ cron: value }` → update row or show error inline

New state in component:
```
cronEditId: string | null       // which schedule is being edited
cronDraft: string               // current draft value while editing
scheduleActionErr: string | null // error banner (delete/toggle/edit failures)
```

New i18n keys: `wf.schedule.delete`, `wf.schedule.deleteConfirm`, `wf.schedule.deleteFailed`, `wf.schedule.toggleFailed`, `wf.schedule.cronSaveErr`, `wf.schedule.editCron`

---

## B — Editor: Node/Edge Delete UI

### Goal
Make node deletion discoverable without disabling React Flow's native `Delete`/`Backspace` behavior.

### Changes

**`NodeConfigPanel.tsx`**
- Add optional `onDelete?: () => void` prop
- Add `Trash2` button in the panel header (right side, visible when `onDelete` provided)
- Add hint line below the node id: `⌫ Del` in `text-[10px] text-neutral-300`

**`WorkflowEditor.tsx`**
- New callback `handleDeleteNode = useCallback((nodeId) => { setNodes(prev => prev.filter(n => n.id !== nodeId)); setEdges(prev => prev.filter(e => e.source !== nodeId && e.target !== nodeId)); }, [setNodes, setEdges])`
- Pass `onDelete={() => handleDeleteNode(selectedWfNode.id)}` to `<NodeConfigPanel>` when `selectedWfNode` is set

### Notes
- RF native keyboard delete still works unchanged — this just adds UI affordance
- No confirm dialog for node delete (undo is available via browser back; adding confirm breaks flow UX)
- Edge deletion is already discoverable enough (select edge → Delete key)

---

## C — Unsaved Changes Guard

### Goal
Prevent accidental data loss when navigating away from the editor with unsaved changes.

### Changes (`WorkflowEditor.tsx`)

**State:** `const [isDirty, setIsDirty] = useState(false)`

**Set dirty:** Add `setIsDirty(true)` calls in:
- `onNodesChange` handler (wrap existing callback — only set dirty if change type is not initial load)
- `onEdgesChange` handler
- `setWfName` call sites
- Guard: do NOT set dirty during the initial load `useEffect` — use a `loadedRef = useRef(false)`, set to `true` after load completes, only `setIsDirty(true)` when `loadedRef.current`

**Clear dirty:** `setIsDirty(false)` on successful save (inside `handleSave` success path)

**`beforeunload`:**
```typescript
useEffect(() => {
  if (!isDirty) return;
  const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
  window.addEventListener("beforeunload", handler);
  return () => window.removeEventListener("beforeunload", handler);
}, [isDirty]);
```

**Back link guard:** Replace `<a href={...}>` with a `<button>` that calls `router.push` after optional `window.confirm` when `isDirty`

**Visual indicator:** Show `●` dot before the "Lưu" button label when `isDirty` (e.g. `{isDirty ? "● " : ""}Lưu`)

---

## D — Connector/Action Picker

### Goal
Replace free-text `connectorId` and `action` inputs in `ConnectorForm` with dropdowns populated from `GET /api/connectors`, preventing typo bugs and showing connection status.

### Data fetching

In `NodeConfigPanel` (top-level component, already has access to `useT`):
- Add `connectors: ConnectorListItem[]` state, fetched once on mount via `useEffect → fetch("/api/connectors")`
- Pass `connectors` down to `ConnectorForm` as prop
- On fetch error: `connectors = []` (graceful degrade to text input)

Type: use `ConnectorListItem` from `@/lib/connectors/types` (browser-safe, no secrets)

### `ConnectorForm` changes

**Connector select:**
```tsx
<select value={node.connectorId} onChange={...}>
  <option value="">— chọn connector —</option>
  {connectors.map(c => (
    <option key={c.id} value={c.id}>
      {c.name} {c.connected ? "🟢" : "⚫"}
    </option>
  ))}
</select>
```
Falls back to `<input type="text">` when `connectors.length === 0`

**Action select:**
- Derive `availableActions: string[]` from `connectors.find(c => c.id === node.connectorId)?.tools ?? []`
- `<select value={node.action} disabled={!node.connectorId} onChange={...}>`
- Falls back to `<input type="text">` when connector not in list OR `availableActions.length === 0`
- **Reset rule:** when connector selection changes → call `onChange({ ...node, connectorId: newId, action: "" })` to clear the stale action value

**Connected warning:** When selected connector has `connected: false`, show inline warning badge below the connector select: "⚠ Connector chưa kết nối — workflow sẽ fail khi chạy"

**i18n:** Add `wf.node.connector.notConnected`, `wf.node.connector.selectConnector`, `wf.node.connector.selectAction`

### Graceful degrade matrix

| Condition | Connector field | Action field |
|-----------|----------------|--------------|
| Fetch OK, connectors list populated | `<select>` | `<select>` (filtered) |
| Connector not in registry (existing node) | `<select>` with value shown as text option | `<input type="text">` |
| Fetch failed / empty list | `<input type="text">` | `<input type="text">` |

---

## Testing

Each item gets unit tests:

- **B**: `NodeConfigPanel.test.tsx` — test onDelete prop renders delete button, click calls onDelete
- **C**: `WorkflowEditor.test.tsx` — test isDirty set after node change, cleared after save
- **A**: `api/workflows/schedules/[id]/route.test.ts` — ownership-checked DELETE and PATCH
- **D**: `NodeConfigPanel.test.tsx` — test dropdown renders when connectors provided, fallback to input when empty

---

## Out of scope (this iteration)

- E: Structured condition/foreach form (complex, separate spec)
- F: Cancel running workflow
- BLAST_HIGH manual preview
- Schedule timezone editing (only cron + enabled for now)
