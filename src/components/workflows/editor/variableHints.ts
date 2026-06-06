import type { WfNode } from "@/lib/workflow/types";

/**
 * Variable-reference suggestions for an interpolated ({{...}}) field in the editor.
 * Offers the run trigger plus each SIBLING node's output — a node can't reference
 * its own (not-yet-produced) output, so the current node is excluded.
 *
 * Pure + tested; the UI (chips) lives in NodeConfigPanel's VariableHints.
 */
export function variableSuggestions(
  allNodes: ReadonlyArray<WfNode>,
  currentNodeId: string,
): string[] {
  const out = ["{{trigger}}"];
  for (const n of allNodes) {
    if (n.id === currentNodeId) continue;
    out.push(`{{steps.${n.id}.output}}`);
  }
  return out;
}
