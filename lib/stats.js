// LAAM — aggregate statistics over all parsed sessions.
// Consumes the output of scanAll() and produces dashboard-ready numbers:
// totals, per-status / per-model / per-project / per-branch breakdowns,
// an activity timeline bucketed over time, and "top N" leaderboards.

import { costUSD, PRICE_UPDATED } from './pricing.js';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

function bucketStart(ts, size) {
  return Math.floor(ts / size) * size;
}

// Build a contiguous, evenly-spaced activity series from session start times.
// Picks an hourly bucket for short spans, daily for longer ones, so the
// timeline never explodes into hundreds of points.
function buildActivity(sessions) {
  const starts = sessions
    .map((s) => ({ ts: s.startTime, tokens: (s.tokens?.input || 0) + (s.tokens?.output || 0) }))
    .filter((x) => x.ts != null)
    .sort((a, b) => a.ts - b.ts);
  if (!starts.length) return { bucketMs: HOUR, points: [] };

  const min = starts[0].ts;
  const max = starts[starts.length - 1].ts;
  const span = max - min;
  const bucketMs = span > 2 * DAY ? DAY : HOUR;

  const map = new Map();
  for (const s of starts) {
    const key = bucketStart(s.ts, bucketMs);
    const cur = map.get(key) || { sessions: 0, tokens: 0 };
    cur.sessions += 1;
    cur.tokens += s.tokens;
    map.set(key, cur);
  }

  // Fill gaps so the line chart reads as a real timeline (cap at 90 points).
  const firstKey = bucketStart(min, bucketMs);
  const lastKey = bucketStart(max, bucketMs);
  const points = [];
  let guard = 0;
  for (let k = firstKey; k <= lastKey && guard < 90; k += bucketMs, guard++) {
    const v = map.get(k) || { sessions: 0, tokens: 0 };
    points.push({ ts: k, sessions: v.sessions, tokens: v.tokens });
  }
  return { bucketMs, points };
}

function topN(arr, keyFn, n = 8) {
  return arr
    .slice()
    .sort((a, b) => (keyFn(b) || 0) - (keyFn(a) || 0))
    .slice(0, n);
}

export function computeStats(scan) {
  const sessions = scan.sessions || [];
  const projects = scan.projects || [];

  const totals = {
    sessions: sessions.length,
    projects: projects.length,
    running: 0,
    idle: 0,
    done: 0,
    messages: 0,
    userMessages: 0,
    assistantMessages: 0,
    toolCalls: 0,
    subAgents: 0,
    runningSubAgents: 0,
    tokensIn: 0,
    tokensOut: 0,
    tokensTotal: 0,
    totalDurationMs: 0,
  };

  totals.costUSD = 0;

  const byModel = new Map();
  const byBranch = new Map();
  const toolAgg = new Map(); // name -> { name, count, errors, totalDurationMs, timed }
  const heatmap = Array.from({ length: 7 }, () => new Array(24).fill(0));

  for (const s of sessions) {
    totals[s.status] = (totals[s.status] || 0) + 1;
    totals.messages += s.messageCount || 0;
    totals.userMessages += s.userMessageCount || 0;
    totals.assistantMessages += s.assistantMessageCount || 0;
    totals.toolCalls += s.toolUseCount || 0;
    totals.subAgents += s.subAgentCount || 0;
    totals.runningSubAgents += (s.subAgents || []).filter((a) => a.status === 'running').length;
    const tin = s.tokens?.input || 0;
    const tout = s.tokens?.output || 0;
    totals.tokensIn += tin;
    totals.tokensOut += tout;
    const cost = costUSD(s.model, tin, tout);
    totals.costUSD += cost;
    if (s.durationMs && s.durationMs > 0) totals.totalDurationMs += s.durationMs;

    const m = s.model || 'unknown';
    const mm = byModel.get(m) || { model: m, count: 0, tokensIn: 0, tokensOut: 0, costUSD: 0, totalDurationMs: 0, done: 0, running: 0, idle: 0 };
    mm.count += 1;
    mm.tokensIn += tin;
    mm.tokensOut += tout;
    mm.costUSD += cost;
    if (s.durationMs && s.durationMs > 0) mm.totalDurationMs += s.durationMs;
    mm[s.status] = (mm[s.status] || 0) + 1;
    byModel.set(m, mm);

    const b = s.gitBranch || '(no branch)';
    byBranch.set(b, (byBranch.get(b) || 0) + 1);

    // Tool leaderboard accumulation.
    for (const t of s.tools || []) {
      const a = toolAgg.get(t.name) || { name: t.name, count: 0, errors: 0, totalDurationMs: 0, timed: 0 };
      a.count += t.count || 0;
      a.errors += t.errors || 0;
      a.totalDurationMs += t.totalDurationMs || 0;
      a.timed += t.timed || 0;
      toolAgg.set(t.name, a);
    }

    // Heatmap merge.
    for (const [key, n] of Object.entries(s.histo || {})) {
      const [d, h] = key.split('_').map(Number);
      if (d >= 0 && d < 7 && h >= 0 && h < 24) heatmap[d][h] += n;
    }
  }

  totals.tokensTotal = totals.tokensIn + totals.tokensOut;
  totals.avgDurationMs = totals.sessions ? Math.round(totals.totalDurationMs / totals.sessions) : 0;

  const byProject = projects.map((p) => {
    let tokensIn = 0, tokensOut = 0, toolCalls = 0, messages = 0, subAgents = 0, cost = 0;
    for (const s of p.sessions) {
      tokensIn += s.tokens?.input || 0;
      tokensOut += s.tokens?.output || 0;
      toolCalls += s.toolUseCount || 0;
      messages += s.messageCount || 0;
      subAgents += s.subAgentCount || 0;
      cost += costUSD(s.model, s.tokens?.input || 0, s.tokens?.output || 0);
    }
    return {
      name: p.name,
      path: p.path,
      sessions: p.sessionCount,
      running: p.runningCount,
      tokensIn,
      tokensOut,
      tokensTotal: tokensIn + tokensOut,
      costUSD: cost,
      toolCalls,
      messages,
      subAgents,
    };
  });

  // Tool leaderboards.
  const toolList = [...toolAgg.values()].map((a) => ({
    name: a.name,
    count: a.count,
    errors: a.errors,
    errorRate: a.count ? a.errors / a.count : 0,
    avgDurationMs: a.timed ? Math.round(a.totalDurationMs / a.timed) : null,
  }));
  const toolLeaderboard = {
    mostUsed: toolList.slice().sort((a, b) => b.count - a.count).slice(0, 12),
    mostErrors: toolList.filter((t) => t.errors > 0).sort((a, b) => b.errors - a.errors).slice(0, 10),
    slowest: toolList.filter((t) => t.avgDurationMs != null).sort((a, b) => b.avgDurationMs - a.avgDurationMs).slice(0, 10),
  };

  // Model comparison: speed (tokens/min), totals, completion rate.
  const modelComparison = [...byModel.values()].map((m) => {
    const tokensTotal = m.tokensIn + m.tokensOut;
    const avgDurationMs = m.count ? Math.round(m.totalDurationMs / m.count) : 0;
    const minutes = m.totalDurationMs / 60000;
    return {
      model: m.model,
      count: m.count,
      tokensIn: m.tokensIn,
      tokensOut: m.tokensOut,
      tokensTotal,
      costUSD: m.costUSD,
      avgDurationMs,
      tokensPerMin: minutes > 0 ? Math.round(tokensTotal / minutes) : 0,
      doneRate: m.count ? (m.done || 0) / m.count : 0,
      done: m.done || 0,
      running: m.running || 0,
      idle: m.idle || 0,
    };
  }).sort((a, b) => b.tokensTotal - a.tokensTotal);

  const heatmapMax = Math.max(0, ...heatmap.flat());

  return {
    scannedAt: scan.scannedAt || Date.now(),
    projectsDir: scan.projectsDir,
    totals,
    byStatus: { running: totals.running, idle: totals.idle, done: totals.done },
    byModel: [...byModel.values()].sort((a, b) => b.count - a.count),
    byBranch: [...byBranch.entries()].map(([branch, count]) => ({ branch, count })).sort((a, b) => b.count - a.count),
    toolLeaderboard,
    modelComparison,
    heatmap: { cells: heatmap, max: heatmapMax },
    pricing: { updated: PRICE_UPDATED, note: 'Giá ước tính, có thể lỗi thời — xem lib/pricing.js' },
    byProject: byProject.sort((a, b) => b.sessions - a.sessions),
    activity: buildActivity(sessions),
    topByDuration: topN(sessions, (s) => s.durationMs).map((s) => ({
      id: s.id, project: s.project, model: s.model, durationMs: s.durationMs || 0, status: s.status,
    })),
    topByTokens: topN(sessions, (s) => (s.tokens?.input || 0) + (s.tokens?.output || 0)).map((s) => ({
      id: s.id, project: s.project, model: s.model,
      tokensTotal: (s.tokens?.input || 0) + (s.tokens?.output || 0), status: s.status,
    })),
  };
}
