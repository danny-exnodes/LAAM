/**
 * autoLayout.ts — PURE (no side effects, no I/O, no @xyflow import).
 *
 * "Tidy" auto-layout for a workflow graph. The engine guarantees every runnable
 * graph is a TREE flowing left→right (≤1 incoming edge per node, exactly one
 * start — see src/lib/workflow/validate.ts), so a simple layered layout is both
 * sufficient and dependency-free:
 *   - x = rank × xGap, where rank = longest path from a start node (left→right,
 *     matching the editor's Position.Right→Left handles + graph-serde AUTO_LAYOUT_X).
 *   - y = order-within-rank × yGap, where order follows a DFS preorder from the
 *     starts so a node's children cluster together and condition true/false
 *     branches land on distinct rows.
 *
 * Takes only ids + edges (not React Flow nodes) so it stays trivially unit-
 * testable and never clobbers the domain WfNode type. The caller applies the
 * returned positions and is responsible for fitView. Runs only on explicit
 * user action ("Tidy"), so hand-placed positions are never auto-overwritten.
 */

export type LayoutNode = { id: string };
export type LayoutEdge = { from: string; to: string };
export type XY = { x: number; y: number };

export interface LayoutOpts {
  /** Horizontal gap between ranks (columns). */
  xGap?: number;
  /** Vertical gap between rows within/across ranks. */
  yGap?: number;
}

const DEFAULT_X_GAP = 220; // mirror graph-serde AUTO_LAYOUT_X
const DEFAULT_Y_GAP = 120;

/**
 * Compute a tidy left→right layered position for each node.
 * Robust to general DAGs (longest-path ranking) and degrades gracefully on
 * malformed input (orphans / cycles) — every node always gets a position.
 */
export function layoutPositions(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  opts: LayoutOpts = {},
): Record<string, XY> {
  const xGap = opts.xGap ?? DEFAULT_X_GAP;
  const yGap = opts.yGap ?? DEFAULT_Y_GAP;

  const ids = nodes.map((n) => n.id);
  const idSet = new Set(ids);
  const succ = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const id of ids) {
    succ.set(id, []);
    indeg.set(id, 0);
  }
  for (const e of edges) {
    if (!idSet.has(e.from) || !idSet.has(e.to)) continue; // ignore dangling edges
    succ.get(e.from)!.push(e.to);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }

  // ── Rank = longest path from a start (Kahn topological relaxation) ──
  const rank = new Map<string, number>();
  for (const id of ids) rank.set(id, 0);
  const work = new Map(indeg);
  const q = ids.filter((id) => (work.get(id) ?? 0) === 0);
  const ranked = new Set<string>();
  while (q.length) {
    const cur = q.shift()!;
    ranked.add(cur);
    for (const nx of succ.get(cur)!) {
      rank.set(nx, Math.max(rank.get(nx)!, rank.get(cur)! + 1));
      work.set(nx, (work.get(nx) ?? 0) - 1);
      if ((work.get(nx) ?? 0) === 0) q.push(nx);
    }
  }
  // Cycle fallback: nodes never reached by topo (only possible on an invalid
  // cyclic graph) keep rank 0 so they still get a stable column.

  // ── y-order = DFS preorder from the starts (children cluster under parents) ──
  const order = new Map<string, number>();
  let counter = 0;
  const visit = (id: string) => {
    if (order.has(id)) return;
    order.set(id, counter++);
    for (const nx of succ.get(id)!) visit(nx);
  };
  for (const id of ids) {
    if ((indeg.get(id) ?? 0) === 0) visit(id);
  }
  for (const id of ids) visit(id); // any leftovers (cycles/orphans) keep stable order

  // ── Assign coordinates: x by rank, y by order rank within each column ──
  const byRank = new Map<number, string[]>();
  for (const id of ids) {
    const r = rank.get(id) ?? 0;
    (byRank.get(r) ?? byRank.set(r, []).get(r)!).push(id);
  }
  const positions: Record<string, XY> = {};
  for (const [r, columnIds] of byRank) {
    columnIds.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    columnIds.forEach((id, row) => {
      positions[id] = { x: Math.round(r * xGap), y: Math.round(row * yGap) };
    });
  }
  return positions;
}
