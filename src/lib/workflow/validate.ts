// Cổng A0/A1 (spec §5.5): engine tuyến tính chỉ chạy single-path acyclic.
// Reject branch/cycle/dangling — KHÔNG execute nửa chừng thứ engine chưa hiểu.
import type { WorkflowGraph, WfNode } from "./types";

export function assertLinear(graph: WorkflowGraph): void {
  const ids = new Set(graph.nodes.map((n) => n.id));
  if (ids.size !== graph.nodes.length) throw new Error("validate: trùng node id");
  const outCount = new Map<string, number>();
  const inCount = new Map<string, number>();
  for (const e of graph.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) throw new Error(`validate: edge trỏ node unknown (${e.from}→${e.to})`);
    outCount.set(e.from, (outCount.get(e.from) ?? 0) + 1);
    inCount.set(e.to, (inCount.get(e.to) ?? 0) + 1);
  }
  for (const [id, c] of outCount) if (c > 1) throw new Error(`validate: branch tại "${id}" (>1 cạnh ra) — A0 chỉ tuyến tính`);
  for (const [id, c] of inCount) if (c > 1) throw new Error(`validate: merge tại "${id}" (>1 cạnh vào) — A0 chỉ tuyến tính`);
  // start = node không có cạnh vào. 0 start (mọi node đều có cạnh vào) ⟹ CHẮC CHẮN cycle
  // (đồ thị hữu hạn). >1 start = rời rạc/forest. Cả hai reject; 0-start báo đúng là cycle.
  const starts = graph.nodes.filter((n) => !inCount.get(n.id));
  if (graph.nodes.length > 0 && starts.length === 0) {
    throw new Error("validate: cycle — không có node start (mọi node đều có cạnh vào)");
  }
  if (starts.length !== 1) throw new Error(`validate: cần đúng 1 start, có ${starts.length}`);
  // walk theo cạnh; nếu thăm lại → cycle; số node thăm phải = tổng node.
  const seen = new Set<string>();
  let cur: string | undefined = starts[0].id;
  while (cur) {
    if (seen.has(cur)) throw new Error("validate: cycle phát hiện");
    seen.add(cur);
    cur = graph.edges.find((e) => e.from === cur)?.to;
  }
  if (seen.size !== graph.nodes.length) throw new Error("validate: node mồ côi (không nối vào chain)");
}

export function linearOrder(graph: WorkflowGraph): WfNode[] {
  assertLinear(graph);
  const inCount = new Map<string, number>();
  for (const e of graph.edges) inCount.set(e.to, (inCount.get(e.to) ?? 0) + 1);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const order: WfNode[] = [];
  let cur: string | undefined = graph.nodes.find((n) => !inCount.get(n.id))!.id;
  while (cur) {
    order.push(byId.get(cur)!);
    cur = graph.edges.find((e) => e.from === cur)?.to;
  }
  return order;
}
