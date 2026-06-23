// Pure helpers for the foreach BODY visual builder. The body is a full WorkflowGraph
// (nodes + edges) that runs once per item. The vast-majority case is a LINEAR sequence
// ("for each item: do step 1, then step 2…"). These helpers detect that case so the UI
// can offer a structured step list (with a raw-JSON fallback for branchy bodies), and
// auto-generate the linear chaining edges so the user never hand-writes JSON edges.
import type { WfNode, WfEdge, WorkflowGraph } from "@/lib/workflow/types";

// Kinds offered in the simple linear builder. Nested foreach/condition need branching →
// they stay raw-JSON only (linearize() returns null for them → UI falls back).
export const FOREACH_STEP_KINDS = ["agent", "connector", "mcp"] as const;
export type ForeachStepKind = (typeof FOREACH_STEP_KINDS)[number];

function isStepKind(k: string): k is ForeachStepKind {
  return (FOREACH_STEP_KINDS as readonly string[]).includes(k);
}

/**
 * If `graph` is a simple linear chain of step-kind nodes (one entry, each node → at most
 * one successor via an UNLABELED edge, no branch/merge/cycle, every node reachable),
 * return the nodes in execution order. Otherwise return null (caller → raw-JSON mode).
 * An empty/absent graph returns [] (a valid empty linear body).
 */
export function linearize(graph: WorkflowGraph | null | undefined): WfNode[] | null {
  const nodes = graph?.nodes ?? [];
  const edges = graph?.edges ?? [];
  if (nodes.length === 0) return [];
  if (!nodes.every((n) => isStepKind(n.kind))) return null; // condition/foreach/branchy
  if (edges.some((e) => e.label)) return null; // labels = condition true/false branches

  const out = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const n of nodes) {
    out.set(n.id, []);
    indeg.set(n.id, 0);
  }
  for (const e of edges) {
    if (!out.has(e.from) || !indeg.has(e.to)) return null; // edge to unknown node
    out.get(e.from)!.push(e.to);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }
  // linear ⇒ every node has ≤1 out and ≤1 in
  for (const n of nodes) {
    if (out.get(n.id)!.length > 1) return null; // branch
    if ((indeg.get(n.id) ?? 0) > 1) return null; // merge
  }
  const starts = nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0);
  if (starts.length !== 1) return null; // 0 ⇒ cycle; >1 ⇒ disconnected pieces

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const order: WfNode[] = [];
  const seen = new Set<string>();
  let cur: string | undefined = starts[0].id;
  while (cur) {
    if (seen.has(cur)) return null; // cycle
    seen.add(cur);
    const node = byId.get(cur);
    if (!node) return null;
    order.push(node);
    cur = out.get(cur)![0];
  }
  return order.length === nodes.length ? order : null; // unreachable node ⇒ not linear
}

/** Build a graph from an ordered node list as a linear chain (preserve canvas positions). */
export function buildLinearGraph(nodes: WfNode[], prev?: WorkflowGraph | null): WorkflowGraph {
  const edges: WfEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) edges.push({ from: nodes[i].id, to: nodes[i + 1].id });
  const positions = prev?.positions ? { ...prev.positions } : undefined;
  return { nodes, edges, ...(positions ? { positions } : {}) };
}

/** A unique body-node id (b1, b2, …) not colliding with existing nodes. */
export function nextStepId(existing: WfNode[]): string {
  const ids = new Set(existing.map((n) => n.id));
  let i = existing.length + 1;
  while (ids.has(`b${i}`)) i++;
  return `b${i}`;
}

/** Default node of a given step kind (minimal valid shape; validate catches blanks at run). */
export function makeStep(kind: ForeachStepKind, id: string): WfNode {
  if (kind === "agent") return { id, kind: "agent", prompt: "" };
  if (kind === "connector") return { id, kind: "connector", connectorId: "", action: "", args: {} };
  return { id, kind: "mcp", server: "", tool: "", args: {} };
}

/** Change a step's kind, preserving its id (and thus its place in the chain). */
export function changeStepKind(node: WfNode, kind: ForeachStepKind): WfNode {
  return node.kind === kind ? node : makeStep(kind, node.id);
}

/** Move the item at `index` one slot in `dir`; returns a new array (no-op at the ends). */
export function moveStep(nodes: WfNode[], index: number, dir: -1 | 1): WfNode[] {
  const j = index + dir;
  if (index < 0 || index >= nodes.length || j < 0 || j >= nodes.length) return nodes;
  const copy = [...nodes];
  [copy[index], copy[j]] = [copy[j], copy[index]];
  return copy;
}
