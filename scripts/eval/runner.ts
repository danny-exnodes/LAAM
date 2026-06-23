import { runToolRounds, type ChatMessage, type ToolRoundsDeps } from "@/lib/agent/orchestrator";
import { buildSystemPrompt } from "@/lib/agent/context";
import type { ConnectorTool } from "@/lib/connectors/types";
import type { RunTrace, Scenario, ScenarioScore } from "./types";
import { makeStubDispatch } from "./stub-dispatch";
import { runGraders } from "./graders";

export type RunnerDeps = {
  callOllama: ToolRoundsDeps["callOllama"];
  buildTools: (s: Scenario) => ConnectorTool[];
  maxRounds?: number;
  now?: number;
};

// Một lần chạy: gọi runToolRounds THẬT (loop prod) + 1 call bù để bắt finalText
// (runToolRounds vứt text vòng cuối — xem orchestrator.ts). Lỗi → trace rỗng (fail-soft).
async function runOnce(s: Scenario, deps: RunnerDeps): Promise<RunTrace> {
  const t0 = Date.now();
  const tools = deps.buildTools(s);
  const { dispatch, calls } = makeStubDispatch(s.toolStubs);
  const system = buildSystemPrompt({
    lang: "vi",
    now: deps.now ?? t0,
    // QW-1: truyền {name, kind} để eval đo đúng prompt grouped đọc/ghi như prod.
    tools: tools.map((t) => ({ name: t.function.name, kind: t.kind })),
  });
  const messages: ChatMessage[] = [{ role: "system", content: system }, { role: "user", content: s.input }];
  try {
    // maxRounds now via opts; per-scenario override (e.g. loopGuard) preserved, default = prod backstop.
    const convo = await runToolRounds(messages, tools, { callOllama: deps.callOllama, dispatch }, { maxRounds: deps.maxRounds });
    const rounds = convo.filter((m) => m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length).length;
    const finalRes = await deps.callOllama(convo, []); // call bù: lấy câu trả lời cuối
    const finalText = finalRes?.message?.content ?? "";
    return { convo, calls, rounds, finalText, ms: Date.now() - t0 };
  } catch (e) {
    return { convo: [], calls, rounds: 0, finalText: `__error__: ${e instanceof Error ? e.message : String(e)}`, ms: Date.now() - t0 };
  }
}

export async function runScenario(s: Scenario, deps: RunnerDeps, k: number): Promise<ScenarioScore> {
  const perDim: Record<string, { passed: number; total: number }> = {};
  const fails: string[] = [];
  let totalMs = 0;
  let noCall = 0; // Nit 1: số run model KHÔNG gọi tool nào (tách no-call khỏi wrong-call).
  for (let i = 0; i < k; i++) {
    const trace = await runOnce(s, deps);
    totalMs += trace.ms;
    if (trace.calls.length === 0) noCall++;
    for (const g of runGraders(trace, s)) {
      const cell = (perDim[g.dim] ??= { passed: 0, total: 0 });
      cell.total++;
      if (g.pass) cell.passed++;
      else fails.push(`[${s.id}#${i + 1}] ${g.dim}: ${g.detail ?? "fail"}`);
    }
  }
  return { id: s.id, capability: s.capability, runs: k, perDim, fails, avgMs: Math.round(totalMs / Math.max(1, k)), noCall };
}
