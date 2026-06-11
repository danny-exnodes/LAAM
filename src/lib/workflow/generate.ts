// generate.ts — PURE. Turns the user's connector catalog + the workflow DSL into a
// generation prompt and a permissive JSON-schema for Ollama structured output, and
// normalizes the model's raw output into a valid-SHAPED WorkflowGraph.
//
// Rule 13: the model's ids/kinds are NEVER trusted. coerceGraph re-derives them in
// code (unique ids, known kinds, object args); assertRunnable (caller) is the validity
// gate. The model proposes; code disposes.

import type { WorkflowGraph, WfNode, WfNodeKind, WfEdge, Predicate } from "./types";
import type { ConnectorListItem } from "@/lib/connectors/types";

const KINDS: WfNodeKind[] = ["agent", "connector", "condition", "foreach"];

// ── Catalog: render the user's connectors + tools (name + param keys) for the prompt.
export function buildCatalog(connectors: ConnectorListItem[]): string {
  if (!connectors.length) return "(no connectors connected)";
  return connectors
    .map((c) => {
      const tools = c.tools
        .map((t) => {
          const props = (t.parameters as { properties?: Record<string, unknown> } | undefined)?.properties;
          const params = props && typeof props === "object" ? Object.keys(props) : [];
          return `    - ${t.name}(${params.join(", ")})${t.description ? ` — ${t.description}` : ""}`;
        })
        .join("\n");
      return `  • ${c.id} (${c.name})${c.connected ? "" : " [not connected]"}\n${tools || "    (no tools)"}`;
    })
    .join("\n");
}

// ── System prompt: the DSL + graph constraints + interpolation + catalog + an example.
export function generationSystem(catalog: string): string {
  return [
    'You design LAAM workflow graphs. Output ONLY a JSON object: { "nodes": [...], "edges": [...] }.',
    "",
    'Node kinds (every node has a unique "id" and a "kind"):',
    '  - agent:     { id, kind:"agent", prompt, system?, format? }   — an AI step; format = optional JSON-schema → the step outputs a parsed OBJECT (e.g. a judge node with format {verdict, reason} whose {{steps.<id>.output.verdict}} a condition can test with eq)',
    '  - connector: { id, kind:"connector", connectorId, action, args } — call a connected tool',
    '  - condition: { id, kind:"condition", when:{ left, op, right? } } — branches true/false',
    '  - foreach:   { id, kind:"foreach", items, body:{ nodes, edges } } — loop over a list',
    "",
    'Edges: { from, to, label? }. A condition node MUST have exactly two out-edges labelled "true" and "false".',
    "Constraints: exactly ONE start node; a single path except condition branches; no node has more than one",
    "incoming edge (no merge); no cycles; every node reachable from the start.",
    "Reference an earlier step's result with {{steps.<nodeId>.output}} and the trigger payload with {{trigger}}.",
    "",
    "Available connectors — use these exact connectorId + action names:",
    catalog,
    "",
    'Example — "summarize my tasks then notify me":',
    '{ "nodes": [',
    '  { "id": "list", "kind": "connector", "connectorId": "demo", "action": "demo_list_tasks", "args": {} },',
    '  { "id": "sum", "kind": "agent", "prompt": "Summarize these tasks: {{steps.list.output}}" }',
    '], "edges": [ { "from": "list", "to": "sum" } ] }',
    "",
    "Common idioms:",
    "  judge-verify: agent(prompt) → agent(format={verdict:enum[PASS,FAIL],reason}) → condition(eq, {{steps.judge.output.verdict}}, PASS) → true:action / false:skip",
    "  binary-classify: chain of condition nodes on the same field with eq — each branch leads to a distinct action node; no switch node needed",
    "  pipeline-per-item: connector(list) → foreach(items={{steps.list.output}}, body={agent(process {{vars.item}})})",
  ].join("\n");
}

// Frame the user message: a plain prompt for fresh generation, or — when a non-empty
// `current` graph is supplied (refine / #3 stretch) — an EDIT instruction that embeds the
// current graph and asks for the FULL edited graph back (so coerce+validate still apply).
export function buildUserMessage(prompt: string, current?: unknown): string {
  const nodes = (current as { nodes?: unknown } | null | undefined)?.nodes;
  if (Array.isArray(nodes) && nodes.length > 0) {
    return (
      "Workflow hiện tại:\n```json\n" +
      JSON.stringify(current) +
      "\n```\n\nSửa workflow trên theo yêu cầu sau. GIỮ NGUYÊN các phần không liên quan, " +
      "và trả về TOÀN BỘ graph mới sau khi sửa:\n" +
      prompt
    );
  }
  return prompt;
}

// ── Permissive format schema for Ollama `format`. Structure only (loose union of all
//    kinds' fields); coerceGraph + assertRunnable enforce real validity afterwards.
export const GRAPH_FORMAT = {
  type: "object",
  properties: {
    nodes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: KINDS },
          prompt: { type: "string" },
          system: { type: "string" },
          format: { type: "object" },
          connectorId: { type: "string" },
          action: { type: "string" },
          args: { type: "object" },
          items: { type: "string" },
        },
        required: ["id", "kind"],
      },
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        properties: { from: { type: "string" }, to: { type: "string" }, label: { type: "string" } },
        required: ["from", "to"],
      },
    },
  },
  required: ["nodes", "edges"],
} as const;

// ── Coerce: normalize the model's raw JSON into a valid-shaped WorkflowGraph.
export function coerceGraph(raw: unknown): WorkflowGraph {
  const r = (raw ?? {}) as { nodes?: unknown; edges?: unknown };
  const rawNodes = Array.isArray(r.nodes) ? r.nodes : [];
  const rawEdges = Array.isArray(r.edges) ? r.edges : [];

  const used = new Set<string>(); // final ids, guaranteed unique
  const remap = new Map<string, string>(); // model's claimed id → final id (first occurrence)
  const nodes: WfNode[] = [];

  rawNodes.forEach((rn, i) => {
    const n = (rn ?? {}) as Record<string, unknown>;
    const kind: WfNodeKind = KINDS.includes(n.kind as WfNodeKind) ? (n.kind as WfNodeKind) : "agent";
    const claimed = typeof n.id === "string" && n.id.trim() ? n.id.trim() : "";
    let id = claimed || `${kind}-${i + 1}`;
    while (used.has(id)) id = `${id}-${i + 1}`; // de-dup
    used.add(id);
    if (claimed && !remap.has(claimed)) remap.set(claimed, id);
    nodes.push(coerceNode(id, kind, n));
  });

  const edges: WfEdge[] = rawEdges.map((re) => {
    const e = (re ?? {}) as Record<string, unknown>;
    const edge: WfEdge = {
      from: remap.get(String(e.from)) ?? String(e.from ?? ""),
      to: remap.get(String(e.to)) ?? String(e.to ?? ""),
    };
    if (e.label === "true" || e.label === "false") edge.label = e.label;
    return edge;
  });

  return { nodes, edges };
}

function coerceNode(id: string, kind: WfNodeKind, n: Record<string, unknown>): WfNode {
  switch (kind) {
    case "connector":
      return {
        id,
        kind: "connector",
        connectorId: String(n.connectorId ?? ""),
        action: String(n.action ?? ""),
        args: n.args && typeof n.args === "object" && !Array.isArray(n.args) ? (n.args as Record<string, unknown>) : {},
      };
    case "condition":
      return { id, kind: "condition", when: coerceWhen(n.when) };
    case "foreach":
      return { id, kind: "foreach", items: String(n.items ?? ""), body: coerceGraph(n.body) };
    case "agent":
    default:
      return {
        id,
        kind: "agent",
        prompt: String(n.prompt ?? ""),
        ...(n.system != null && n.system !== "" ? { system: String(n.system) } : {}),
        // B1: format chỉ giữ khi là plain object (JSON-schema) — array/string bị bỏ (Rule 13).
        ...(n.format && typeof n.format === "object" && !Array.isArray(n.format)
          ? { format: n.format as Record<string, unknown> }
          : {}),
      };
  }
}

// The engine validates predicate CONTENT at run time; coerce only guarantees an object
// shape so the node is structurally valid (assertRunnable doesn't inspect `when`).
function coerceWhen(raw: unknown): Predicate {
  if (raw && typeof raw === "object") return raw as Predicate;
  return { left: "{{trigger}}", op: "exists" };
}
