/**
 * constellationLayout.ts — PURE (no React, no DOM).
 *
 * Polar layout for the chat "constellation command-center": the user's custom
 * agents on an INNER ring and their connector / MCP / internal tool GROUPS on an
 * OUTER ring, around an origin-centered orb. Coordinates are in an origin-centered
 * SVG space (viewBox "-50 -50 100 100", center = 0,0) so the math is symmetric.
 *
 * Rule 13: each node's `ref` carries the IDENTICAL source object (the CatalogGroup,
 * not a re-typed name string) so click handlers hand code-derived ground-truth back
 * to the existing dispatch paths — nothing is reconstructed from a label.
 */
import type { CatalogGroup, CatalogTool } from "@/lib/chat/toolCatalog";

export type ConstellationRef = { agentId: string } | { group: CatalogGroup; tool?: CatalogTool };

export type ConstellationNode = {
  id: string;
  kind: "agent" | "connector" | "mcp" | "internal";
  label: string;
  /** Origin-centered coordinates (center = 0,0). */
  x: number;
  y: number;
  /** Angle in radians (0 = +x; first node sits at the top, -π/2). */
  angle: number;
  ref: ConstellationRef;
};

export const INNER_RADIUS = 22; // custom agents
export const OUTER_RADIUS = 40; // connector / mcp / internal groups

/** Even angular position for item `i` of `n`, with the first node at the top. */
function polar(i: number, n: number): number {
  if (n <= 1) return -Math.PI / 2;
  return i * ((2 * Math.PI) / n) - Math.PI / 2;
}

function place(angle: number, r: number): { x: number; y: number } {
  // Round to 4 decimals to keep SVG markup tidy without drifting off the radius.
  return { x: +(r * Math.cos(angle)).toFixed(4), y: +(r * Math.sin(angle)).toFixed(4) };
}

export function layoutConstellation(
  groups: CatalogGroup[],
  agents: { id: string; name: string }[],
): ConstellationNode[] {
  const agentNodes: ConstellationNode[] = agents.map((a, i) => {
    const angle = polar(i, agents.length);
    return { id: `agent:${a.id}`, kind: "agent", label: a.name, angle, ...place(angle, INNER_RADIUS), ref: { agentId: a.id } };
  });
  const groupNodes: ConstellationNode[] = groups.map((g, i) => {
    const angle = polar(i, groups.length);
    return { id: `group:${g.id}`, kind: g.type, label: g.label, angle, ...place(angle, OUTER_RADIUS), ref: { group: g } };
  });
  return [...agentNodes, ...groupNodes];
}
