// Cổng validate. A0 (assertLinear/linearOrder): single-path acyclic. G1
// (assertRunnable): cho phép condition (đúng 2 cạnh true+false) + foreach (body
// đệ quy), giữ no-fan-in/no-cycle/1-start. Reject thứ engine chưa hiểu (fail-loud).
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

// G1: validate đồ-thị-nhánh. condition phân nhánh true/false; foreach body đệ quy.
// Giữ: id duy nhất · edge trỏ node tồn tại · ≤1 cạnh vào (no fan-in/merge) · đúng 1
// start · mọi node reachable từ start (no orphan) · không chu trình. A0 tuyến tính
// là tập con HỢP LỆ.
export function assertRunnable(graph: WorkflowGraph): void {
  const ids = new Set(graph.nodes.map((n) => n.id));
  if (ids.size !== graph.nodes.length) throw new Error("validate: trùng node id");

  const out = new Map<string, { to: string; label?: string }[]>();
  const inCount = new Map<string, number>();
  for (const e of graph.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) throw new Error(`validate: edge trỏ node unknown (${e.from}→${e.to})`);
    (out.get(e.from) ?? out.set(e.from, []).get(e.from)!).push({ to: e.to, label: e.label });
    inCount.set(e.to, (inCount.get(e.to) ?? 0) + 1);
  }

  // Cạnh vào: ≤1 (no merge). Cạnh ra: condition=đúng {true,false}; còn lại ≤1.
  for (const [id, c] of inCount) if (c > 1) throw new Error(`validate: merge tại "${id}" (>1 cạnh vào) — không hỗ trợ fan-in`);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  for (const node of graph.nodes) {
    // B1: agent.format (structured output) nếu có phải là plain object (JSON-schema).
    if (node.kind === "agent" && node.format !== undefined) {
      if (typeof node.format !== "object" || node.format === null || Array.isArray(node.format)) {
        throw new Error(`validate: agent "${node.id}" — format phải là object JSON-schema (không nhận array/string)`);
      }
    }
    const outs = out.get(node.id) ?? [];
    if (node.kind === "condition") {
      const labels = outs.map((o) => o.label).sort();
      if (outs.length !== 2 || labels[0] !== "false" || labels[1] !== "true") {
        throw new Error(`validate: condition "${node.id}" cần đúng 2 cạnh ra label true+false (có [${labels.join(",")}])`);
      }
    } else if (outs.length > 1) {
      throw new Error(`validate: branch tại "${node.id}" (>1 cạnh ra) — chỉ condition mới phân nhánh`);
    }
  }

  if (graph.nodes.length > 0) {
    const starts = graph.nodes.filter((n) => !inCount.get(n.id));
    if (starts.length === 0) throw new Error("validate: cycle — không có node start (mọi node đều có cạnh vào)");
    if (starts.length !== 1) throw new Error(`validate: cần đúng 1 start, có ${starts.length}`);
    // DFS theo MỌI cạnh ra (phân nhánh); thăm lại → cycle.
    const seen = new Set<string>();
    const stack = [starts[0].id];
    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.has(cur)) throw new Error("validate: cycle phát hiện");
      seen.add(cur);
      for (const o of out.get(cur) ?? []) stack.push(o.to);
    }
    if (seen.size !== graph.nodes.length) throw new Error("validate: node mồ côi (không nối vào chain)");
  }

  // foreach body: validate đệ quy (cùng luật).
  for (const node of byId.values()) {
    if (node.kind === "foreach") assertRunnable(node.body);
  }
}
