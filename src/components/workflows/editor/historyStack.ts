// Pure undo/redo stack for the workflow editor (F). Snapshots are opaque here —
// the editor computes a `sig` (data signature) so view-only changes (selection,
// dimensions) dedupe to a no-op. Kept pure + generic so the branching logic
// (truncate redo tail, cap, pointer math) is unit-tested without React.

export type Snapshot = { nodes: unknown[]; edges: unknown[]; sig: string };
export type HistoryState = { stack: Snapshot[]; pointer: number };

export const emptyHistory = (): HistoryState => ({ stack: [], pointer: -1 });

export const canUndo = (h: HistoryState): boolean => h.pointer > 0;
export const canRedo = (h: HistoryState): boolean => h.pointer < h.stack.length - 1;

/**
 * Push a snapshot. Returns the SAME reference (no-op) when the sig matches the
 * current top — so callers can cheaply detect "nothing changed". Otherwise
 * truncates any redo tail, appends, and caps the stack at `max` (drops oldest).
 */
export function pushSnapshot(h: HistoryState, snap: Snapshot, max = 50): HistoryState {
  const top = h.stack[h.pointer];
  if (top && top.sig === snap.sig) return h; // identical data → no-op (same ref)
  const kept = h.stack.slice(0, h.pointer + 1); // drop redo tail
  kept.push(snap);
  const overflow = Math.max(0, kept.length - max);
  const stack = overflow > 0 ? kept.slice(overflow) : kept;
  return { stack, pointer: stack.length - 1 };
}

/** Move the pointer back one. Returns the new state + the snapshot to restore (null at start). */
export function undo(h: HistoryState): { history: HistoryState; snapshot: Snapshot | null } {
  if (!canUndo(h)) return { history: h, snapshot: null };
  const pointer = h.pointer - 1;
  return { history: { stack: h.stack, pointer }, snapshot: h.stack[pointer] };
}

/** Move the pointer forward one. Returns the new state + the snapshot to restore (null at end). */
export function redo(h: HistoryState): { history: HistoryState; snapshot: Snapshot | null } {
  if (!canRedo(h)) return { history: h, snapshot: null };
  const pointer = h.pointer + 1;
  return { history: { stack: h.stack, pointer }, snapshot: h.stack[pointer] };
}
