import type { ConstNode } from "./nodeModel";

export type Placed = ConstNode & { x: number; y: number };

const INNER = 22;
const OUTER = 40;

// Origin-centered polar layout; angles start at -90° and spread evenly per ring.
export function placeNodes(nodes: ConstNode[], opts?: { mobile?: boolean }): Placed[] {
  const rings: Record<"inner" | "outer", ConstNode[]> = { inner: [], outer: [] };
  for (const n of nodes) rings[n.ring].push(n);
  const radius = { inner: INNER, outer: opts?.mobile ? OUTER * 0.9 : OUTER };
  const out: Placed[] = [];
  for (const ring of ["inner", "outer"] as const) {
    const list = rings[ring];
    list.forEach((n, i) => {
      const ang = -Math.PI / 2 + (list.length ? (i / list.length) * Math.PI * 2 : 0);
      out.push({ ...n, x: Math.cos(ang) * radius[ring], y: Math.sin(ang) * radius[ring] * (opts?.mobile ? 0.72 : 1) });
    });
  }
  return out;
}
