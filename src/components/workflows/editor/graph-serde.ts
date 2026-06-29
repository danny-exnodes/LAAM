/**
 * graph-serde.ts — PURE (no side effects, no I/O).
 *
 * Converts between LAAM WorkflowGraph ↔ React Flow nodes/edges.
 *
 * Position strategy:
 *   - WfNode has NO position field — the domain type stays clean.
 *   - Positions persist in WorkflowGraph.positions (nodeId → xy): captured on save
 *     via capturePositions() and restored by toReactFlow(). The WfNode round-trip
 *     (fromReactFlow ∘ toReactFlow) stays position-free.
 *   - First load / new nodes with no saved position → auto-layout by index.
 */
import type { Node as RFNode, Edge as RFEdge } from "@xyflow/react";
import type { WfNode, WfEdge, WorkflowGraph } from "@/lib/workflow/types";

// ── Constants ──────────────────────────────────────────────────────────────

const NODE_TYPE = "wf";
const AUTO_LAYOUT_X = 220;
const AUTO_LAYOUT_Y = 140;

// ── Public API ─────────────────────────────────────────────────────────────

export type WfRFNode = RFNode<{ node: WfNode }, typeof NODE_TYPE>;
export type WfRFEdge = RFEdge;

export interface RFGraph {
  nodes: WfRFNode[];
  edges: WfRFEdge[];
}

/**
 * pruneDanglingEdges — drop edges whose source or target node no longer exists.
 * Defensive cleanup on load: a persisted graph can carry edges to deleted nodes
 * (corruption / older bugs), which would otherwise render as ghost edges or trip
 * validation. Pure — returns a new graph; positions/viewport are preserved.
 */
export function pruneDanglingEdges(graph: WorkflowGraph): WorkflowGraph {
  const ids = new Set(graph.nodes.map((n) => n.id));
  const edges = graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  if (edges.length === graph.edges.length) return graph; // nothing pruned → same ref
  return { ...graph, edges };
}

/**
 * toReactFlow — WorkflowGraph → React Flow nodes + edges.
 *
 * Positions: auto-layout by index (x = col * AUTO_LAYOUT_X,
 * y = index * AUTO_LAYOUT_Y). The caller may override positions via
 * `useNodesState` after load; they are not persisted back to the graph.
 */
export function toReactFlow(graph: WorkflowGraph): RFGraph {
  const rfNodes: WfRFNode[] = graph.nodes.map((node, i) => ({
    id: node.id,
    type: NODE_TYPE,
    // Restore the saved canvas position; fall back to auto-layout by index.
    position: graph.positions?.[node.id] ?? { x: i * AUTO_LAYOUT_X, y: 0 },
    data: { node },
  }));

  const rfEdges: WfRFEdge[] = graph.edges.map((edge) => ({
    id: `${edge.from}->${edge.to}-${edge.label ?? ""}`,
    source: edge.from,
    target: edge.to,
    label: edge.label,
  }));

  return { nodes: rfNodes, edges: rfEdges };
}

/**
 * fromReactFlow — React Flow nodes + edges → WorkflowGraph.
 *
 * Only the WfNode payload (data.node) is kept; React Flow presentation
 * (position, selected, type, …) is dropped. Edge labels are preserved.
 */
export function fromReactFlow(
  rfNodes: RFNode[],
  rfEdges: RFEdge[],
): WorkflowGraph {
  const nodes: WfNode[] = rfNodes.map((rfn) => {
    // data.node carries the authoritative WfNode
    const wfNode = (rfn.data as { node: WfNode }).node;
    return wfNode;
  });

  const edges: WfEdge[] = rfEdges.map((rfe) => {
    const edge: WfEdge = { from: rfe.source, to: rfe.target };
    if (rfe.label !== undefined && rfe.label !== null && rfe.label !== "") {
      edge.label = rfe.label as string;
    }
    return edge;
  });

  return { nodes, edges };
}

/**
 * capturePositions — RF nodes → a nodeId → xy map for WorkflowGraph.positions.
 * Kept separate from fromReactFlow so the WfNode round-trip stays position-free.
 */
export function capturePositions(rfNodes: RFNode[]): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  for (const n of rfNodes) {
    if (n.position) positions[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
  }
  return positions;
}
