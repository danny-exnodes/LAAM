// Bộ điều phối THUẦN. G1: walker đệ quy theo cạnh (KHÔNG flat-order). agent/connector
// → runNode (DI, hợp đồng A0 bất biến); condition → evalPredicate rồi đi cạnh
// label===String(kết quả); foreach → resolve items (mảng) rồi chạy body mỗi item với
// vars.item/index (steps RIÊNG mỗi vòng). Budget = counter dùng-chung qua đệ quy
// (chống runaway). Validate trước (assertRunnable, đệ quy cả foreach body). fail-stop.
//
// P (2026-07-10): graph.parallel===true → scheduleGraph (bộ lập lịch topological song
// song) THAY walkGraph. walkGraph GIỮ NGUYÊN cho graph tuyến tính (mặc định) — linear là
// subset hợp lệ, byte-identical (golden test). Xem docs/…/comfyui-parallel-workflow-design.
import type { WorkflowGraph, RunContext, StepRecord, WfNode, WfForeachNode, Predicate, Budget, Concurrency } from "./types";
import { DEFAULT_BUDGET, DEFAULT_CONCURRENCY } from "./types";
import { assertRunnable } from "./validate";
import { resolveTemplate, interpolateArgs } from "./interpolate";

export type EngineDeps = {
  runNode: (node: WfNode, ctx: RunContext) => Promise<unknown>;
  onStep: (step: StepRecord) => Promise<void>;
  evalPredicate: (pred: Predicate, ctx: RunContext) => boolean; // DI để test thuần
  // W4 cancel (additive): hỏi TRƯỚC mỗi node (kể cả body foreach). true → dừng gọn:
  // không chạy node kế, KHÔNG đánh failed; step đã xong đã persist qua onStep trước đó.
  // DI để run.ts re-read status run từ DB.
  shouldStop?: () => Promise<boolean>;
  // P: trần đồng thời cho scheduler song song (agent→GPU pool nhỏ / io→pool rộng). Mặc
  // định DEFAULT_CONCURRENCY. Bỏ qua khi graph tuyến tính. Test đặt {agent:1,io:1} → tất định.
  concurrency?: Concurrency;
};

export type EngineResult = {
  status: "succeeded" | "failed" | "cancelled";
  context: RunContext;
  failedNodeId?: string;
  error?: string;
};

// Kết quả 1 lần walk (graph gốc hoặc 1 body foreach). terminalOutput = output node cuối.
type WalkResult = {
  status: "succeeded" | "failed" | "cancelled";
  failedNodeId?: string;
  error?: string;
  terminalOutput?: unknown;
};

type Counter = { steps: number }; // holder DÙNG-CHUNG xuyên đệ quy foreach (PIN của plan)

// Preview "input" cho StepRecord running (run.ts persist run_step.input). Best-effort:
// resolve lỗi (vd missing path) → undefined; node thật vẫn fail-loud qua runNode.
function previewInput(node: WfNode, ctx: RunContext): unknown {
  try {
    switch (node.kind) {
      case "agent": return resolveTemplate(node.prompt, ctx, "text");
      case "connector": return interpolateArgs(node.args ?? {}, ctx);
      case "condition": return node.when;
      case "foreach": return undefined; // foreach gắn input={count} ở handler (cần items.length)
    }
  } catch { return undefined; }
}

// foreach: chạy body sub-graph mỗi item (steps RIÊNG mỗi vòng; vars kế thừa + {item,index}).
// TÁCH RA (từ walkGraph inline) để scheduleGraph tái dùng Y HỆT — foreach body luôn TUẦN TỰ
// (dùng lại walkGraph), kể cả trong graph song song. Emit onStep running/succeeded/failed của
// chính foreach node; caller set ctx.steps + đi cạnh ra. THROW (not-array/budget) propagate.
async function runForeachNode(
  node: WfForeachNode,
  deps: EngineDeps,
  ctx: RunContext,
  budget: Budget,
  counter: Counter,
  base: Omit<StepRecord, "status">,
): Promise<WalkResult> {
  const items = resolveTemplate(node.items, ctx, "arg");
  if (!Array.isArray(items)) throw new Error(`foreach "${node.id}": items không phải mảng (${typeof items})`);
  if (items.length > budget.maxForeachItems) throw new Error(`budget: max foreach items exceeded (${budget.maxForeachItems})`);
  await deps.onStep({ ...base, status: "running", input: { count: items.length } });
  const outputs: unknown[] = [];
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    // Body isolation: steps RIÊNG mỗi vòng; vars kế thừa (copy) + {item,index} → branch-local.
    const subCtx: RunContext = { trigger: ctx.trigger, vars: { ...ctx.vars, item, index }, steps: {} };
    const sub = await walkGraph(node.body, deps, subCtx, budget, counter, node.id);
    // W4 cancel trong body: propagate gọn. Row 'running' của foreach để nguyên — status
    // run-level 'cancelled' là nguồn sự thật (không có step-status cancelled).
    if (sub.status === "cancelled") return { status: "cancelled" };
    if (sub.status === "failed") {
      await deps.onStep({ ...base, status: "failed", error: sub.error });
      return { status: "failed", failedNodeId: sub.failedNodeId, error: sub.error };
    }
    outputs.push(sub.terminalOutput);
  }
  await deps.onStep({ ...base, status: "succeeded", output: outputs });
  return { status: "succeeded", terminalOutput: outputs };
}

function walkGraph(
  graph: WorkflowGraph,
  deps: EngineDeps,
  ctx: RunContext,
  budget: Budget,
  counter: Counter,
  parentNodeId: string | undefined,
): Promise<WalkResult> {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  // start = node không có cạnh vào (assertRunnable đã đảm bảo đúng 1, hoặc 0 node).
  const inTargets = new Set(graph.edges.map((e) => e.to));
  const start = graph.nodes.find((n) => !inTargets.has(n.id));

  return (async (): Promise<WalkResult> => {
    let cur: string | undefined = start?.id;
    let seq = 0;
    let terminalOutput: unknown;

    while (cur) {
      const node = byId.get(cur)!;

      // W4 cancel: kiểm TRƯỚC mỗi node. Dừng gọn — không emit step nào cho node chưa chạy.
      if (deps.shouldStop && (await deps.shouldStop())) return { status: "cancelled" };

      // Budget: mỗi node được xử lý = 1 (gồm condition/foreach + node body qua đệ quy).
      counter.steps++;
      if (counter.steps > budget.maxSteps) throw new Error(`budget: max steps exceeded (${budget.maxSteps})`);

      const base: Omit<StepRecord, "status"> = { nodeId: node.id, kind: node.kind, seq, ...(parentNodeId ? { parentNodeId } : {}) };

      // ── foreach: vòng lặp sub-graph; KHÔNG đi qua runNode ──
      if (node.kind === "foreach") {
        const r = await runForeachNode(node, deps, ctx, budget, counter, base);
        if (r.status !== "succeeded") return r; // cancelled/failed đã emit trong helper
        ctx.steps[node.id] = { output: r.terminalOutput };
        terminalOutput = r.terminalOutput;
        cur = graph.edges.find((e) => e.from === node.id)?.to; // foreach: đúng 1 cạnh ra
        seq++;
        continue;
      }

      // ── condition: eval predicate, đi cạnh label===String(kết quả) ──
      if (node.kind === "condition") {
        await deps.onStep({ ...base, status: "running", input: node.when });
        let result: boolean;
        try {
          result = deps.evalPredicate(node.when, ctx);
        } catch (e) {
          const error = e instanceof Error ? e.message : String(e);
          await deps.onStep({ ...base, status: "failed", error });
          return { status: "failed", failedNodeId: node.id, error };
        }
        ctx.steps[node.id] = { output: result };
        await deps.onStep({ ...base, status: "succeeded", output: result });
        terminalOutput = result;
        cur = graph.edges.find((e) => e.from === node.id && e.label === String(result))?.to; // không khớp → kết thúc
        seq++;
        continue;
      }

      // ── agent/connector: chạy qua runNode (hợp đồng A0) ──
      await deps.onStep({ ...base, status: "running", input: previewInput(node, ctx) });
      try {
        const output = await deps.runNode(node, ctx);
        ctx.steps[node.id] = { output };
        await deps.onStep({ ...base, status: "succeeded", output });
        terminalOutput = output;
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        await deps.onStep({ ...base, status: "failed", error });
        return { status: "failed", failedNodeId: node.id, error };
      }
      cur = graph.edges.find((e) => e.from === node.id)?.to; // agent/connector: ≤1 cạnh ra
      seq++;
    }

    return { status: "succeeded", terminalOutput };
  })();
}

// ── P: Bộ lập lịch topological song song ──────────────────────────────────────

// Semaphore async đơn giản (tách ollama/io). release() trao slot THẲNG cho waiter đầu hàng.
class Semaphore {
  private avail: number;
  private waiters: Array<() => void> = [];
  constructor(n: number) {
    this.avail = Math.max(1, Math.floor(n));
  }
  async acquire(): Promise<void> {
    if (this.avail > 0) {
      this.avail--;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }
  release(): void {
    const next = this.waiters.shift();
    if (next) next(); // slot đi thẳng cho waiter (avail giữ nguyên)
    else this.avail++;
  }
}

// topoRank = đường-dài-nhất từ start (Kahn relaxation) — sắp ready-queue theo (rank,id) để
// concurrency=1 tái tạo THỨ TỰ TUYẾN TÍNH chính xác (golden equivalence).
function topoRanks(nodes: WfNode[], edges: { from: string; to: string }[]): Map<string, number> {
  const ids = nodes.map((n) => n.id);
  const succ = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const id of ids) {
    succ.set(id, []);
    indeg.set(id, 0);
  }
  for (const e of edges) {
    if (!succ.has(e.from) || !indeg.has(e.to)) continue;
    succ.get(e.from)!.push(e.to);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }
  const rank = new Map<string, number>(ids.map((id): [string, number] => [id, 0]));
  const work = new Map(indeg);
  const q = ids.filter((id) => (work.get(id) ?? 0) === 0);
  while (q.length) {
    const cur = q.shift()!;
    for (const nx of succ.get(cur)!) {
      rank.set(nx, Math.max(rank.get(nx)!, rank.get(cur)! + 1));
      work.set(nx, (work.get(nx) ?? 0) - 1);
      if ((work.get(nx) ?? 0) === 0) q.push(nx);
    }
  }
  return rank;
}

// Chạy DAG song song có giới hạn. Tri-state (pending→done|pruned), prune-propagation,
// OR-join (chờ MỌI cạnh vào resolved-hoặc-pruned, chạy nếu ≥1 active), seq toàn cục gán lúc
// dispatch, fail-stop/cancel/budget HỢP TÁC (cờ aborted + Promise.allSettled DRAIN trước
// finalize → không write đáp sau finalize, WAL settle), deadlock detector fail-loud.
async function scheduleGraph(
  graph: WorkflowGraph,
  deps: EngineDeps,
  ctx: RunContext,
  budget: Budget,
  counter: Counter,
  concurrency: Concurrency,
): Promise<WalkResult> {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const outEdges = new Map<string, { to: string; label?: string }[]>();
  const indeg = new Map<string, number>();
  for (const n of graph.nodes) {
    outEdges.set(n.id, []);
    indeg.set(n.id, 0);
  }
  for (const e of graph.edges) {
    outEdges.get(e.from)?.push({ to: e.to, label: e.label });
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }
  const rank = topoRanks(graph.nodes, graph.edges);

  const status = new Map<string, "pending" | "done" | "pruned">(graph.nodes.map((n) => [n.id, "pending"]));
  const remaining = new Map(indeg);
  const activeIn = new Map<string, number>(graph.nodes.map((n) => [n.id, 0]));
  const seqCtr = { v: 0 };
  const ollamaSem = new Semaphore(concurrency.agent);
  const ioSem = new Semaphore(concurrency.io);
  const semFor = (n: WfNode) => (n.kind === "agent" ? ollamaSem : ioSem);

  let aborted: WalkResult | null = null;
  const abort = (a: WalkResult) => {
    if (!aborted) aborted = a; // lỗi/cancel ĐẦU TIÊN thắng (run vẫn failed/cancelled dù chọn cái nào)
  };

  const ready: string[] = [];
  const inFlight = new Set<Promise<void>>();

  const onEdge = (mId: string, active: boolean) => {
    remaining.set(mId, (remaining.get(mId) ?? 0) - 1);
    if (active) activeIn.set(mId, (activeIn.get(mId) ?? 0) + 1);
    if ((remaining.get(mId) ?? 0) === 0) {
      if ((activeIn.get(mId) ?? 0) >= 1) ready.push(mId);
      else prune(mId);
    }
  };
  const prune = (mId: string) => {
    if (status.get(mId) !== "pending") return;
    status.set(mId, "pruned"); // node bị prune: KHÔNG chạy, KHÔNG emit (client suy diễn 'skipped' — P1)
    for (const e of outEdges.get(mId) ?? []) onEdge(e.to, false);
  };
  const resolveOut = (node: WfNode, out: unknown) => {
    for (const e of outEdges.get(node.id) ?? []) {
      const active = node.kind !== "condition" ? true : e.label === String(out);
      onEdge(e.to, active);
    }
  };

  for (const n of graph.nodes) if ((indeg.get(n.id) ?? 0) === 0) ready.push(n.id);

  const dispatch = async (id: string) => {
    const node = byId.get(id)!;
    // W4 cancel: kiểm TRƯỚC mỗi dispatch (đặc biệt trước write). Fail-soft do shouldStop lo.
    if (deps.shouldStop && (await deps.shouldStop())) {
      abort({ status: "cancelled" });
      return;
    }
    if (aborted) return;
    const seq = seqCtr.v++; // GÁN Ở ĐÂY → duy nhất + hợp lệ topo (mọi tổ tiên đã terminal)
    counter.steps++; // điểm serialize đồng bộ (đơn luồng, không await xen giữa read-add-write)
    if (counter.steps > budget.maxSteps) {
      abort({ status: "failed", error: `budget: max steps exceeded (${budget.maxSteps})` }); // KHÔNG raw-throw
      return;
    }
    const base: Omit<StepRecord, "status"> = { nodeId: node.id, kind: node.kind, seq };
    const task = (async () => {
      const sem = semFor(node);
      await sem.acquire();
      try {
        if (aborted) return; // dừng trước khi chạy (side-effect thật — nhất là write)
        if (node.kind === "foreach") {
          const r = await runForeachNode(node, deps, ctx, budget, counter, base);
          if (r.status === "cancelled") return abort({ status: "cancelled" });
          if (r.status === "failed") return abort({ status: "failed", failedNodeId: r.failedNodeId, error: r.error });
          ctx.steps[node.id] = { output: r.terminalOutput };
          status.set(node.id, "done");
          resolveOut(node, r.terminalOutput);
          return;
        }
        await deps.onStep({ ...base, status: "running", input: previewInput(node, ctx) });
        const out = node.kind === "condition" ? deps.evalPredicate(node.when, ctx) : await deps.runNode(node, ctx);
        ctx.steps[node.id] = { output: out }; // ghi key RIÊNG (sync, atomic giữa await)
        await deps.onStep({ ...base, status: "succeeded", output: out });
        status.set(node.id, "done");
        resolveOut(node, out);
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        if (node.kind !== "foreach") await deps.onStep({ ...base, status: "failed", error });
        abort({ status: "failed", failedNodeId: node.id, error });
      } finally {
        sem.release();
      }
    })();
    inFlight.add(task);
    void task.finally(() => {
      inFlight.delete(task);
    });
  };

  while (!aborted && (ready.length > 0 || inFlight.size > 0)) {
    ready.sort((a, b) => rank.get(a)! - rank.get(b)! || (a < b ? -1 : a > b ? 1 : 0));
    while (ready.length > 0 && !aborted) {
      await dispatch(ready.shift()!);
    }
    if (inFlight.size > 0) await Promise.race([...inFlight]);
  }

  if (aborted) {
    await Promise.allSettled([...inFlight]); // DRAIN: write in-flight settle + WAL đóng sạch trước finalize
    return aborted;
  }
  // Clean exit: mọi node phải done|pruned. Còn 'pending' = lỗi prune/join → FAIL LOUD (Rule 12).
  const stuck = graph.nodes.filter((n) => status.get(n.id) === "pending");
  if (stuck.length > 0) {
    throw new Error(`deadlock: ${stuck.length} node chưa resolved (${stuck.map((n) => n.id).join(", ")})`);
  }
  return { status: "succeeded" };
}

export async function runWorkflow(
  graph: WorkflowGraph,
  deps: EngineDeps,
  ctx0: RunContext,
  budget: Budget = DEFAULT_BUDGET,
): Promise<EngineResult> {
  assertRunnable(graph); // throw → propagate (run.ts bắt + finalize failed). Đệ quy cả foreach body.
  const ctx = ctx0;
  const counter: Counter = { steps: 0 };
  // P: graph.parallel → scheduler DAG song song; ngược lại walkGraph tuyến tính (BẤT BIẾN).
  const r = graph.parallel
    ? await scheduleGraph(graph, deps, ctx, budget, counter, deps.concurrency ?? DEFAULT_CONCURRENCY)
    : await walkGraph(graph, deps, ctx, budget, counter, undefined);
  if (r.status === "cancelled") return { status: "cancelled", context: ctx };
  if (r.status === "failed") return { status: "failed", context: ctx, failedNodeId: r.failedNodeId, error: r.error };
  return { status: "succeeded", context: ctx };
}
