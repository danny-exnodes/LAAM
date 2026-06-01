// LAAM — aggregate statistics over all parsed sessions.
// Consumes the output of scanAll() and produces dashboard-ready numbers:
// totals, per-status / per-model / per-project / per-branch breakdowns,
// an activity timeline bucketed over time, and "top N" leaderboards.

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

  const byModel = new Map();
  const byBranch = new Map();

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
    if (s.durationMs && s.durationMs > 0) totals.totalDurationMs += s.durationMs;

    const m = s.model || 'unknown';
    const mm = byModel.get(m) || { model: m, count: 0, tokensIn: 0, tokensOut: 0 };
    mm.count += 1;
    mm.tokensIn += tin;
    mm.tokensOut += tout;
    byModel.set(m, mm);

    const b = s.gitBranch || '(no branch)';
    byBranch.set(b, (byBranch.get(b) || 0) + 1);
  }

  totals.tokensTotal = totals.tokensIn + totals.tokensOut;
  totals.avgDurationMs = totals.sessions ? Math.round(totals.totalDurationMs / totals.sessions) : 0;

  const byProject = projects.map((p) => {
    let tokensIn = 0, tokensOut = 0, toolCalls = 0, messages = 0, subAgents = 0;
    for (const s of p.sessions) {
      tokensIn += s.tokens?.input || 0;
      tokensOut += s.tokens?.output || 0;
      toolCalls += s.toolUseCount || 0;
      messages += s.messageCount || 0;
      subAgents += s.subAgentCount || 0;
    }
    return {
      name: p.name,
      path: p.path,
      sessions: p.sessionCount,
      running: p.runningCount,
      tokensIn,
      tokensOut,
      tokensTotal: tokensIn + tokensOut,
      toolCalls,
      messages,
      subAgents,
    };
  });

  return {
    scannedAt: scan.scannedAt || Date.now(),
    projectsDir: scan.projectsDir,
    totals,
    byStatus: { running: totals.running, idle: totals.idle, done: totals.done },
    byModel: [...byModel.values()].sort((a, b) => b.count - a.count),
    byBranch: [...byBranch.entries()].map(([branch, count]) => ({ branch, count })).sort((a, b) => b.count - a.count),
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
