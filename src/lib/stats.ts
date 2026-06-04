// LAAM v2 — aggregate statistics over agent_session rows for /api/stats.
//
// Ported from v1 `lib/stats.js` (computeStats + helpers buildActivity/topN/
// leaderboards). The aggregation LOGIC is v1's; the RETURN SHAPE is the LOCKED
// `Stats` interface from the Wave 0 plan (records, not arrays-of-objects, etc.)
// so Waves 1–4 compose without drift. See stats.types.ts for the contract.
//
// Field mapping vs v1: v1 read s.tokens.input/output, s.toolUseCount, s.durationMs;
// v2 reads the agent_session columns directly and DERIVES durationMs from
// lastActivity - startedAt (v1 parser semantics). Cost is the stored costUsd
// (v2 persists it; no pricing fallback needed here).

import type { SessionRow, Stats, ToolRow } from "./stats.types";

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

function bucketStart(ts: number, size: number): number {
  return Math.floor(ts / size) * size;
}

// Build an evenly-spaced activity series from session start times. Hourly for
// short spans, daily for longer ones; gaps filled so the line reads as a real
// timeline (capped at 90 points). Mirrors v1 buildActivity, emitting the locked
// {t, sessions, tokens}[] shape.
function buildActivity(sessions: SessionRow[]): Stats["activity"] {
  const starts = sessions
    .map((s) => ({ ts: s.startedAt, tokens: (s.tokensIn || 0) + (s.tokensOut || 0) }))
    .filter((x): x is { ts: number; tokens: number } => x.ts != null)
    .sort((a, b) => a.ts - b.ts);
  if (!starts.length) return [];

  const min = starts[0].ts;
  const max = starts[starts.length - 1].ts;
  const span = max - min;
  const bucketMs = span > 2 * DAY ? DAY : HOUR;

  const map = new Map<number, { sessions: number; tokens: number }>();
  for (const s of starts) {
    const key = bucketStart(s.ts, bucketMs);
    const cur = map.get(key) || { sessions: 0, tokens: 0 };
    cur.sessions += 1;
    cur.tokens += s.tokens;
    map.set(key, cur);
  }

  const firstKey = bucketStart(min, bucketMs);
  const lastKey = bucketStart(max, bucketMs);
  const points: Stats["activity"] = [];
  let guard = 0;
  for (let k = firstKey; k <= lastKey && guard < 90; k += bucketMs, guard++) {
    const v = map.get(k) || { sessions: 0, tokens: 0 };
    points.push({ t: k, sessions: v.sessions, tokens: v.tokens });
  }
  return points;
}

function durationMs(s: SessionRow): number | null {
  if (s.startedAt == null || s.lastActivity == null) return null;
  const d = s.lastActivity - s.startedAt;
  return d > 0 ? d : null;
}

function tokensTotal(s: SessionRow): number {
  return (s.tokensIn || 0) + (s.tokensOut || 0);
}

export function computeStats(sessions: SessionRow[]): Stats {
  const totals = {
    sessions: sessions.length,
    running: 0,
    idle: 0,
    done: 0,
    messages: 0,
    toolCalls: 0,
    subAgents: 0,
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    avgDurationMs: 0,
  };

  const byStatus: Record<string, number> = {};
  const byModel: Record<string, number> = {};
  const byBranch: Record<string, number> = {};

  // Per-tool accumulation. Keyed by the EXACT stored tool name — never
  // normalized/case-folded (AGENTS.md Rule 13): the model may echo a tool name
  // with altered casing, so distinct stored strings stay distinct.
  const toolAgg = new Map<
    string,
    { name: string; count: number; errors: number; weightedDur: number; weightedCount: number }
  >();

  // Per-project and per-model accumulation.
  const projAgg = new Map<
    string,
    { project: string; sessions: number; tokensIn: number; tokensOut: number; toolCalls: number }
  >();
  const modelAgg = new Map<
    string,
    { model: string; sessions: number; tokens: number; costUsd: number; totalDurationMs: number; done: number }
  >();

  const heatmap: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
  let totalDurationMs = 0;

  for (const s of sessions) {
    const status = s.status || "unknown";
    if (status === "running" || status === "idle" || status === "done") {
      totals[status] += 1;
    }
    byStatus[status] = (byStatus[status] || 0) + 1;

    totals.messages += s.messageCount || 0;
    totals.toolCalls += s.toolCount || 0;
    totals.subAgents += s.subAgentCount || 0;
    const tin = s.tokensIn || 0;
    const tout = s.tokensOut || 0;
    totals.tokensIn += tin;
    totals.tokensOut += tout;
    const cost = s.costUsd || 0;
    totals.costUsd += cost;
    const dur = durationMs(s);
    if (dur != null) totalDurationMs += dur;

    const model = s.model || "unknown";
    byModel[model] = (byModel[model] || 0) + 1;
    const mm =
      modelAgg.get(model) ||
      { model, sessions: 0, tokens: 0, costUsd: 0, totalDurationMs: 0, done: 0 };
    mm.sessions += 1;
    mm.tokens += tin + tout;
    mm.costUsd += cost;
    if (dur != null) mm.totalDurationMs += dur;
    if (status === "done") mm.done += 1;
    modelAgg.set(model, mm);

    const branch = s.gitBranch || "(no branch)";
    byBranch[branch] = (byBranch[branch] || 0) + 1;

    const project = s.project || "(no project)";
    const pp =
      projAgg.get(project) ||
      { project, sessions: 0, tokensIn: 0, tokensOut: 0, toolCalls: 0 };
    pp.sessions += 1;
    pp.tokensIn += tin;
    pp.tokensOut += tout;
    pp.toolCalls += s.toolCount || 0;
    projAgg.set(project, pp);

    for (const t of (s.tools || []) as ToolRow[]) {
      const a =
        toolAgg.get(t.name) ||
        { name: t.name, count: 0, errors: 0, weightedDur: 0, weightedCount: 0 };
      a.count += t.count || 0;
      a.errors += t.errors || 0;
      // avgDurationMs is already a per-session average; weight it by this
      // session's tool count so the merged average stays count-weighted.
      if (t.avgDurationMs != null && (t.count || 0) > 0) {
        a.weightedDur += t.avgDurationMs * t.count;
        a.weightedCount += t.count;
      }
      toolAgg.set(t.name, a);
    }

    for (const [key, n] of Object.entries(s.histo || {})) {
      const [d, h] = key.split("_").map(Number);
      if (d >= 0 && d < 7 && h >= 0 && h < 24) heatmap[d][h] += n;
    }
  }

  totals.avgDurationMs = totals.sessions
    ? Math.round(totalDurationMs / totals.sessions)
    : 0;

  const byProject = [...projAgg.values()].sort((a, b) => b.sessions - a.sessions);

  const toolLeaderboard = [...toolAgg.values()]
    .map((a) => ({
      name: a.name,
      count: a.count,
      errors: a.errors,
      errorRate: a.count ? a.errors / a.count : 0,
      avgDurationMs: a.weightedCount ? Math.round(a.weightedDur / a.weightedCount) : null,
    }))
    .sort((a, b) => b.count - a.count);

  const modelComparison = [...modelAgg.values()]
    .map((m) => {
      const minutes = m.totalDurationMs / 60000;
      return {
        model: m.model,
        sessions: m.sessions,
        tokens: m.tokens,
        costUsd: m.costUsd,
        avgDurationMs: m.sessions ? Math.round(m.totalDurationMs / m.sessions) : 0,
        tokensPerMin: minutes > 0 ? Math.round(m.tokens / minutes) : 0,
        doneRate: m.sessions ? m.done / m.sessions : 0,
      };
    })
    .sort((a, b) => b.tokens - a.tokens);

  const label = (s: SessionRow) => `${s.project || "(no project)"} · ${s.model || "unknown"}`;

  const topByDuration = sessions
    .map((s) => ({ id: s.id, label: label(s), durationMs: durationMs(s) || 0 }))
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 8);

  const topByTokens = sessions
    .map((s) => ({ id: s.id, label: label(s), tokens: tokensTotal(s) }))
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 8);

  return {
    totals,
    byStatus,
    byModel,
    byBranch,
    byProject,
    toolLeaderboard,
    modelComparison,
    heatmap,
    activity: buildActivity(sessions),
    topByDuration,
    topByTokens,
  };
}
