import type { WfNode } from "@/lib/workflow/types";

/**
 * Variable-reference suggestions for an interpolated ({{...}}) field — FLOW-AWARE.
 * Offers the run trigger plus the output of each UPSTREAM node only: nodes that
 * actually run before this one (ancestors reachable backward via edges). Downstream
 * or unconnected nodes are excluded — their {{steps.X.output}} is empty at this
 * node's runtime, so suggesting them would mislead.
 *
 * Pure + tested; the UI (chips) lives in NodeConfigPanel's VariableHints.
 */
export function variableSuggestions(
  allNodes: ReadonlyArray<WfNode>,
  edges: ReadonlyArray<{ source: string; target: string }>,
  currentNodeId: string,
  opts?: {
    /** Editing a field inside a foreach body → also offer {{item}} and {{index}}. */
    inForeachBody?: boolean;
  },
): string[] {
  // target → incoming source ids, then BFS backward from the current node.
  const incoming = new Map<string, string[]>();
  for (const e of edges) {
    const list = incoming.get(e.target);
    if (list) list.push(e.source);
    else incoming.set(e.target, [e.source]);
  }
  const ancestors = new Set<string>();
  const stack = [...(incoming.get(currentNodeId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (ancestors.has(id)) continue;
    ancestors.add(id);
    stack.push(...(incoming.get(id) ?? []));
  }
  const out = ["{{trigger}}"];
  for (const n of allNodes) {
    if (!ancestors.has(n.id)) continue;
    out.push(`{{steps.${n.id}.output}}`);
    // An upstream agent with a structured-output `format` JSON-schema exposes named
    // fields the engine resolves ({{steps.x.output.field}}). Expand the schema's
    // top-level properties — CODE-DERIVED from node.format (Rule 13), never guessed.
    if (n.kind === "agent" && n.format && typeof n.format === "object") {
      const props = (n.format as { properties?: Record<string, unknown> }).properties;
      if (props && typeof props === "object" && !Array.isArray(props)) {
        for (const key of Object.keys(props)) out.push(`{{steps.${n.id}.output.${key}}}`);
      }
    }
  }
  // Inside a foreach body the engine injects the current item + its index.
  if (opts?.inForeachBody) out.push("{{item}}", "{{index}}");
  return out;
}
