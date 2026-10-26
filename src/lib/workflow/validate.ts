// Cổng validate. A0 (assertLinear/linearOrder): single-path acyclic. G1
// (assertRunnable): cho phép condition (đúng 2 cạnh true+false) + foreach (body
// đệ quy), giữ no-fan-in/no-cycle/1-start. Reject thứ engine chưa hiểu (fail-loud).
// P (2026-07-10): graph.parallel===true → assertRunnableDag (nới lỏng fan-in/fan-out/
// multi-start; acyclic bằng KAHN — KHÔNG DFS revisit-throws vốn báo nhầm diamond=cycle;
// + ràng buộc ref-tổ-tiên cho {{steps.X}}). Nhánh tuyến tính GIỮ NGUYÊN.
import type { WorkflowGraph, WfNode } from "./types";
import { MAX_FANOUT } from "./types";

// ── P: helper dùng CHUNG cho assertRunnableDag + collectIssues (drift-guard đồng bộ) ──

// Trích id node từ mọi {{steps.<id>...}} trong các trường ĐƯỢC nội suy của node (agent.prompt,
// connector/mcp.args, condition.when, foreach.items). `system` KHÔNG nội suy (executors.ts) → bỏ.
const STEP_REF = /\{\{\s*steps\s*\.\s*([^.}\s]+)/g;
export function stepRefsOf(node: WfNode): string[] {
  let hay = "";
  switch (node.kind) {
    case "agent": hay = node.prompt ?? ""; break;
    case "connector": hay = JSON.stringify(node.args ?? {}); break;
    case "mcp": hay = JSON.stringify(node.args ?? {}); break;
    case "condition": hay = JSON.stringify(node.when ?? {}); break;
    case "foreach": hay = node.items ?? ""; break;
  }
  const ids = new Set<string>();
  for (const m of hay.matchAll(STEP_REF)) ids.add(m[1]);
  return [...ids];
}

// node → tập node tổ tiên (backward-reachable qua cạnh, transitive). Cycle-safe (seen set) để
// collectIssues (advisory, non-throwing) chạy được cả trên graph có chu trình.
export function ancestorsOf(graph: WorkflowGraph): Map<string, Set<string>> {
  const preds = new Map<string, string[]>();
  for (const n of graph.nodes) preds.set(n.id, []);
  for (const e of graph.edges) preds.get(e.to)?.push(e.from);
  const out = new Map<string, Set<string>>();
  for (const n of graph.nodes) {
    const seen = new Set<string>();
    const stack = [...(preds.get(n.id) ?? [])];
    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const p of preds.get(cur) ?? []) stack.push(p);
    }
    out.set(n.id, seen);
  }
  return out;
}

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
  if (graph.parallel) return assertRunnableDag(graph); // P: nhánh DAG song song (nới lỏng)
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

// ── P: validate đồ-thị DAG song song (graph.parallel===true) ──────────────────
// Nới lỏng so với nhánh tuyến tính: CHO PHÉP fan-in (>1 cạnh vào), fan-out (>1 cạnh ra),
// multi-start. GIỮ: id duy nhất · edge trỏ node tồn tại · acyclic (KAHN, không DFS
// revisit-throws) · no-orphan (union DFS từ MỌI start) · condition đúng cặp true/false ·
// agent.format object · đệ quy foreach body. THÊM: fan-out width cap (chống DoS) + ràng
// buộc ref-tổ-tiên (mọi {{steps.X}} phải nối bằng cạnh — scheduler chờ theo CẠNH nhưng
// interpolate đọc theo THAM CHIẾU; trong DAG hai đồ thị phân kỳ → fail loud ở authoring).
export function assertRunnableDag(graph: WorkflowGraph): void {
  const ids = new Set(graph.nodes.map((n) => n.id));
  if (ids.size !== graph.nodes.length) throw new Error("validate: trùng node id");

  const out = new Map<string, { to: string; label?: string }[]>();
  const inCount = new Map<string, number>();
  for (const e of graph.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) throw new Error(`validate: edge trỏ node unknown (${e.from}→${e.to})`);
    (out.get(e.from) ?? out.set(e.from, []).get(e.from)!).push({ to: e.to, label: e.label });
    inCount.set(e.to, (inCount.get(e.to) ?? 0) + 1);
  }

  // Per-node: condition=đúng {true,false}; agent.format object; còn lại fan-out ≤ MAX_FANOUT.
  for (const node of graph.nodes) {
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
    } else if (outs.length > MAX_FANOUT) {
      throw new Error(`validate: fan-out tại "${node.id}" (${outs.length} cạnh ra) vượt trần ${MAX_FANOUT}`);
    }
  }

  if (graph.nodes.length > 0) {
    const starts = graph.nodes.filter((n) => !inCount.get(n.id));
    if (starts.length === 0) throw new Error("validate: cycle — không có node start (mọi node đều có cạnh vào)");
    // Acyclic qua KAHN (bất kỳ node không về được in-degree 0 ⟹ trong/sau chu trình).
    const work = new Map(inCount);
    const q = graph.nodes.filter((n) => !(work.get(n.id) ?? 0)).map((n) => n.id);
    let consumed = 0;
    while (q.length) {
      const cur = q.shift()!;
      consumed++;
      for (const o of out.get(cur) ?? []) {
        work.set(o.to, (work.get(o.to) ?? 0) - 1);
        if ((work.get(o.to) ?? 0) === 0) q.push(o.to);
      }
    }
    if (consumed < graph.nodes.length) throw new Error("validate: cycle phát hiện");
    // Reachability = union DFS từ MỌI start (đa-start) → node mồ côi.
    const seen = new Set<string>();
    const stack = starts.map((s) => s.id);
    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const o of out.get(cur) ?? []) stack.push(o.to);
    }
    if (seen.size !== graph.nodes.length) throw new Error("validate: node mồ côi (không nối vào chain)");
  }

  // ref-tổ-tiên: mọi {{steps.<id>}} phải trỏ node backward-reachable qua cạnh (§3.2.4).
  const anc = ancestorsOf(graph);
  for (const node of graph.nodes) {
    for (const ref of stepRefsOf(node)) {
      if (!anc.get(node.id)!.has(ref)) {
        throw new Error(
          `validate: "${node.id}" tham chiếu {{steps.${ref}}} không phải node tổ tiên — parallel yêu cầu nối bằng cạnh từ "${ref}"`,
        );
      }
    }
  }

  // foreach body: validate đệ quy (body.parallel quyết định nhánh của chính nó).
  for (const node of graph.nodes) {
    if (node.kind === "foreach") assertRunnable(node.body);
  }
}

// ── Structured validation (advisory, non-throwing) ───────────────────────────
// collectIssues walks the SAME rules as assertRunnable but PUSHES a stable,
// code-keyed issue per violation instead of throwing the first one. This lets
// the editor surface ALL problems at once, pinned to the offending node, and
// (AGENTS.md Rule 13) keeps machine codes on the wire — the UI maps each code →
// a localized message, so no Vietnamese/LLM string ever leaks across locales.
// assertRunnable stays the runtime fail-loud gate; this is purely additive.

// One code per throw site in assertRunnable (+ recursion into foreach bodies).
export type WfIssueCode =
  | "dup_id" // trùng node id
  | "edge_unknown" // cạnh trỏ node không tồn tại
  | "fan_in" // >1 cạnh vào (merge) — chỉ khi KHÔNG parallel
  | "multi_out" // >1 cạnh ra ở node không phải condition (parallel: chỉ khi vượt MAX_FANOUT)
  | "condition_branches" // condition không có đúng 2 nhánh true+false
  | "no_start" // không có node start (mọi node đều có cạnh vào ⇒ cycle)
  | "multi_start" // >1 node start (rời rạc) — chỉ khi KHÔNG parallel
  | "cycle" // phát hiện chu trình
  | "orphan" // node không nối vào chain từ start
  | "agent_format" // agent.format không phải object JSON-schema
  | "ref_not_ancestor"; // P: {{steps.X}} trỏ node không phải tổ tiên (parallel — phải nối bằng cạnh)

export type WfIssue = {
  /** Offending node id. For faults inside a foreach body the id is prefixed
   *  with the foreach node id ("foreachId/childId"). Absent for graph-level
   *  faults (no_start / multi_start). */
  nodeId?: string;
  code: WfIssueCode;
  severity: "error";
};

export function collectIssues(graph: WorkflowGraph, idPrefix = ""): WfIssue[] {
  const issues: WfIssue[] = [];
  const tag = (id: string) => (idPrefix ? `${idPrefix}${id}` : id);
  const err = (code: WfIssueCode, nodeId?: string) =>
    issues.push({ code, severity: "error", ...(nodeId !== undefined ? { nodeId } : {}) });
  const parallel = graph.parallel === true; // P: nới lỏng fan-in/fan-out/multi-start; thêm ref-tổ-tiên

  // Duplicate ids.
  const seenIds = new Set<string>();
  for (const n of graph.nodes) {
    if (seenIds.has(n.id)) err("dup_id", tag(n.id));
    seenIds.add(n.id);
  }
  const ids = new Set(graph.nodes.map((n) => n.id));

  const out = new Map<string, { to: string; label?: string }[]>();
  const inCount = new Map<string, number>();
  for (const e of graph.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) {
      err("edge_unknown");
      continue; // skip dangling edges in the structural analysis below
    }
    (out.get(e.from) ?? out.set(e.from, []).get(e.from)!).push({ to: e.to, label: e.label });
    inCount.set(e.to, (inCount.get(e.to) ?? 0) + 1);
  }

  // Per-node local rules (independent of reachability).
  for (const node of graph.nodes) {
    if (node.kind === "agent" && node.format !== undefined) {
      if (typeof node.format !== "object" || node.format === null || Array.isArray(node.format)) {
        err("agent_format", tag(node.id));
      }
    }
    if (!parallel && (inCount.get(node.id) ?? 0) > 1) err("fan_in", tag(node.id)); // parallel cho phép fan-in
    const outs = out.get(node.id) ?? [];
    if (node.kind === "condition") {
      const labels = outs.map((o) => o.label).sort();
      if (outs.length !== 2 || labels[0] !== "false" || labels[1] !== "true") {
        err("condition_branches", tag(node.id));
      }
    } else if ((!parallel && outs.length > 1) || (parallel && outs.length > MAX_FANOUT)) {
      err("multi_out", tag(node.id)); // linear: >1; parallel: chỉ khi vượt trần fan-out
    }
  }

  // Structural rules: start count, cycle, reachability.
  if (graph.nodes.length > 0) {
    const starts = graph.nodes.filter((n) => !inCount.get(n.id));
    if (starts.length === 0) {
      err("no_start"); // every node has an in-edge ⇒ a cycle exists
    } else if (!parallel && starts.length > 1) {
      err("multi_start"); // parallel cho phép nhiều start
    }

    // Cycle detection via Kahn — any node never reaching in-degree 0 is in/after a cycle.
    const work = new Map(inCount);
    const q = graph.nodes.filter((n) => !(work.get(n.id) ?? 0)).map((n) => n.id);
    let consumed = 0;
    const queue = [...q];
    while (queue.length) {
      const cur = queue.shift()!;
      consumed++;
      for (const o of out.get(cur) ?? []) {
        work.set(o.to, (work.get(o.to) ?? 0) - 1);
        if ((work.get(o.to) ?? 0) === 0) queue.push(o.to);
      }
    }
    if (consumed < graph.nodes.length && starts.length > 0) err("cycle");

    // Reachability (cycle-safe DFS) → orphans. Linear: từ start DUY NHẤT. Parallel: union
    // DFS từ MỌI start (đa-start hợp lệ).
    const orphanBases = parallel ? starts.map((s) => s.id) : starts.length === 1 ? [starts[0].id] : [];
    if (orphanBases.length > 0) {
      const seen = new Set<string>();
      const stack = [...orphanBases];
      while (stack.length) {
        const cur = stack.pop()!;
        if (seen.has(cur)) continue;
        seen.add(cur);
        for (const o of out.get(cur) ?? []) stack.push(o.to);
      }
      for (const n of graph.nodes) if (!seen.has(n.id)) err("orphan", tag(n.id));
    }
  }

  // P: ref-tổ-tiên (chỉ parallel) — mirror assertRunnableDag để drift-guard đồng bộ.
  if (parallel) {
    const anc = ancestorsOf(graph);
    for (const node of graph.nodes) {
      for (const ref of stepRefsOf(node)) {
        if (!anc.get(node.id)?.has(ref)) err("ref_not_ancestor", tag(node.id));
      }
    }
  }

  // Recurse into foreach bodies, prefixing nested node ids.
  for (const node of graph.nodes) {
    if (node.kind === "foreach") {
      issues.push(...collectIssues(node.body, `${tag(node.id)}/`));
    }
  }

  return issues;
}
