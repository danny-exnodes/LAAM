// outputRef.ts — PURE. The {{steps.<id>.output}} reference a downstream node uses
// to consume this node's result. Surfaced as a copy-able "I/O badge" on the canvas
// (open-agent-builder's NodeIOBadges pattern) so data flow is legible without
// opening the config panel. Condition nodes branch rather than emit a consumable
// output, so they have no reference.
import type { WfNode } from "@/lib/workflow/types";

export function nodeOutputRef(node: WfNode): string | null {
  if (node.kind === "condition") return null;
  return `{{steps.${node.id}.output}}`;
}
