// Bộ điều phối THUẦN. G1: walker đệ quy theo cạnh (KHÔNG flat-order). agent/connector
// → runNode (DI, hợp đồng A0 bất biến); condition → evalPredicate rồi đi cạnh
// label===String(kết quả); foreach → resolve items (mảng) rồi chạy body mỗi item với
// vars.item/index (steps RIÊNG mỗi vòng). Budget = counter dùng-chung qua đệ quy
// (chống runaway). Validate trước (assertRunnable, đệ quy cả foreach body). fail-stop.
import type { WorkflowGraph, RunContext, StepRecord, WfNode, Predicate, Budget } from "./types";
import { DEFAULT_BUDGET } from "./types";
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
        const items = resolveTemplate(node.items, ctx, "arg");
        if (!Array.isArray(items)) throw new Error(`foreach "${node.id}": items không phải mảng (${typeof items})`);
        if (items.length > budget.maxForeachItems) throw new Error(`budget: max foreach items exceeded (${budget.maxForeachItems})`);
        await deps.onStep({ ...base, status: "running", input: { count: items.length } });
        const outputs: unknown[] = [];
        for (let index = 0; index < items.length; index++) {
          const item = items[index];
          // Body isolation: steps RIÊNG mỗi vòng; vars kế thừa + {item,index}.
          const subCtx: RunContext = { trigger: ctx.trigger, vars: { ...ctx.vars, item, index }, steps: {} };
          const sub = await walkGraph(node.body, deps, subCtx, budget, counter, node.id);
          // W4 cancel trong body: propagate gọn. Row 'running' của foreach để nguyên —
          // status run-level 'cancelled' là nguồn sự thật (không có step-status cancelled).
          if (sub.status === "cancelled") return { status: "cancelled" };
          if (sub.status === "failed") {
            await deps.onStep({ ...base, status: "failed", error: sub.error });
            return { status: "failed", failedNodeId: sub.failedNodeId, error: sub.error };
          }
          outputs.push(sub.terminalOutput);
        }
        ctx.steps[node.id] = { output: outputs };
        await deps.onStep({ ...base, status: "succeeded", output: outputs });
        terminalOutput = outputs;
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

export async function runWorkflow(
  graph: WorkflowGraph,
  deps: EngineDeps,
  ctx0: RunContext,
  budget: Budget = DEFAULT_BUDGET,
): Promise<EngineResult> {
  assertRunnable(graph); // throw → propagate (run.ts bắt + finalize failed). Đệ quy cả foreach body.
  const ctx = ctx0;
  const counter: Counter = { steps: 0 };
  const r = await walkGraph(graph, deps, ctx, budget, counter, undefined);
  if (r.status === "cancelled") return { status: "cancelled", context: ctx };
  if (r.status === "failed") return { status: "failed", context: ctx, failedNodeId: r.failedNodeId, error: r.error };
  return { status: "succeeded", context: ctx };
}
