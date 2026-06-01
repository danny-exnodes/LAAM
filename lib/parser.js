// LAAM — session parser for Claude Code / Agent SDK JSONL transcripts.
// Reads ~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl files and turns
// each into a structured "agent session" model the dashboard can render.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { costUSD } from './pricing.js';

// A session counts as "running" if its file changed within this window.
export const RUNNING_WINDOW_MS = 60 * 1000;
// Older than this and we treat it as finished rather than just idle.
export const IDLE_WINDOW_MS = 15 * 60 * 1000;

export function defaultProjectsDir() {
  return process.env.LAAM_PROJECTS_DIR || path.join(os.homedir(), '.claude', 'projects');
}

function safeReadLines(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const out = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      // skip partial / malformed line (file may be mid-write)
    }
  }
  return out;
}

function asTime(v) {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

// Pull a short human-readable label out of a content block.
function describeBlock(block) {
  if (!block || typeof block !== 'object') return null;
  if (block.type === 'text' && block.text) {
    return { kind: 'text', text: block.text.trim() };
  }
  if (block.type === 'thinking') {
    return { kind: 'thinking', text: '(suy nghĩ…)' };
  }
  if (block.type === 'tool_use') {
    const name = block.name || 'tool';
    const input = block.input || {};
    let detail = '';
    if (name === 'Task') detail = input.description || input.subagent_type || '';
    else if (input.command) detail = String(input.command);
    else if (input.file_path) detail = String(input.file_path);
    else if (input.pattern) detail = String(input.pattern);
    else if (input.path) detail = String(input.path);
    else if (input.url) detail = String(input.url);
    else if (input.prompt) detail = String(input.prompt);
    return { kind: 'tool', text: detail ? `${name} — ${detail}` : name, tool: name };
  }
  return null;
}

function lastMeaningful(content) {
  if (typeof content === 'string') {
    return content.trim() ? { kind: 'text', text: content.trim() } : null;
  }
  if (!Array.isArray(content)) return null;
  for (let i = content.length - 1; i >= 0; i--) {
    const d = describeBlock(content[i]);
    if (d) return d;
  }
  return null;
}

// Parse a single .jsonl session file into a session summary.
export function parseSession(file, now = Date.now()) {
  const entries = safeReadLines(file);
  const stat = (() => {
    try { return fs.statSync(file); } catch { return null; }
  })();
  const mtime = stat ? stat.mtimeMs : null;

  const sessionId = path.basename(file, '.jsonl');

  let cwd = null;
  let model = null;
  let version = null;
  let gitBranch = null;
  let firstTs = null;
  let lastTs = null;
  let userCount = 0;
  let assistantCount = 0;
  let toolUseCount = 0;
  let tokensIn = 0;
  let tokensOut = 0;

  // Track Task tool calls (sub-agents) and their results.
  const taskCalls = new Map(); // tool_use id -> sub-agent record
  const resultTimes = new Map(); // tool_use_id -> timestamp of result
  const resultErrors = new Set(); // tool_use_id of results flagged is_error
  const toolUseById = new Map(); // tool_use id -> { name, ts } (every tool, for leaderboard)
  const histo = {}; // "<dow>_<hour>" -> count of timestamped entries (heatmap)

  let lastMainActivity = null; // {kind,text} from the latest non-sidechain entry
  let lastMainTs = null;

  for (const e of entries) {
    if (!cwd && e.cwd) cwd = e.cwd;
    if (!version && e.version) version = e.version;
    if (e.gitBranch) gitBranch = e.gitBranch;

    const ts = asTime(e.timestamp);
    if (ts) {
      if (firstTs == null || ts < firstTs) firstTs = ts;
      if (lastTs == null || ts > lastTs) lastTs = ts;
      // Heatmap histogram: day-of-week (0=Sun) × hour-of-day, local time.
      const dt = new Date(ts);
      const key = `${dt.getDay()}_${dt.getHours()}`;
      histo[key] = (histo[key] || 0) + 1;
    }

    const msg = e.message;
    const isSidechain = e.isSidechain === true;

    if (e.type === 'assistant' && msg) {
      assistantCount++;
      if (msg.model) model = msg.model;
      if (msg.usage) {
        tokensIn += msg.usage.input_tokens || 0;
        tokensOut += msg.usage.output_tokens || 0;
      }
      const content = msg.content;
      if (Array.isArray(content)) {
        for (const b of content) {
          if (b && b.type === 'tool_use') {
            toolUseCount++;
            toolUseById.set(b.id, { name: b.name || 'tool', ts });
            if (b.name === 'Task') {
              const input = b.input || {};
              taskCalls.set(b.id, {
                id: b.id,
                type: input.subagent_type || 'agent',
                description: input.description || '',
                prompt: typeof input.prompt === 'string' ? input.prompt.slice(0, 600) : '',
                startTime: ts,
              });
            }
          }
        }
      }
      if (!isSidechain) {
        const d = lastMeaningful(content);
        if (d && (lastMainTs == null || (ts ?? 0) >= lastMainTs)) {
          lastMainActivity = d;
          lastMainTs = ts ?? lastMainTs;
        }
      }
    } else if (e.type === 'user' && msg) {
      userCount++;
      const content = msg.content;
      // Detect tool_result blocks that close out Task calls.
      if (Array.isArray(content)) {
        for (const b of content) {
          if (b && b.type === 'tool_result' && b.tool_use_id) {
            resultTimes.set(b.tool_use_id, ts);
            if (b.is_error === true) resultErrors.add(b.tool_use_id);
          }
        }
      }
      if (!isSidechain) {
        const d = lastMeaningful(content);
        // A real user prompt (string) marks the latest activity too.
        if (d && d.kind === 'text' && (lastMainTs == null || (ts ?? 0) >= lastMainTs)) {
          lastMainActivity = { kind: 'user', text: d.text };
          lastMainTs = ts ?? lastMainTs;
        }
      }
    }
  }

  // Resolve sub-agent statuses.
  const subAgents = [];
  for (const t of taskCalls.values()) {
    const endTime = resultTimes.get(t.id) ?? null;
    const running = endTime == null;
    subAgents.push({
      id: t.id,
      type: t.type,
      description: t.description,
      prompt: t.prompt,
      startTime: t.startTime,
      endTime,
      durationMs: t.startTime && endTime ? endTime - t.startTime : (t.startTime ? now - t.startTime : null),
      status: running ? 'running' : 'done',
    });
  }
  subAgents.sort((a, b) => (a.startTime || 0) - (b.startTime || 0));

  // Per-tool aggregation: pair each tool_use with its tool_result for timing.
  const toolAgg = new Map();
  for (const [id, u] of toolUseById) {
    const end = resultTimes.get(id);
    const a = toolAgg.get(u.name) || { name: u.name, count: 0, errors: 0, totalDurationMs: 0, timed: 0 };
    a.count++;
    if (resultErrors.has(id)) a.errors++;
    if (u.ts && end && end >= u.ts) { a.totalDurationMs += end - u.ts; a.timed++; }
    toolAgg.set(u.name, a);
  }
  const tools = [...toolAgg.values()]
    .map((a) => ({
      name: a.name, count: a.count, errors: a.errors,
      totalDurationMs: a.totalDurationMs, timed: a.timed,
      avgDurationMs: a.timed ? Math.round(a.totalDurationMs / a.timed) : null,
    }))
    .sort((x, y) => y.count - x.count);

  const lastActivity = lastTs || mtime || null;
  const age = lastActivity != null ? now - lastActivity : Infinity;
  const fileFresh = mtime != null ? now - mtime < RUNNING_WINDOW_MS : false;
  const hasRunningSub = subAgents.some((s) => s.status === 'running');

  let status;
  if (age < RUNNING_WINDOW_MS || (fileFresh && hasRunningSub)) status = 'running';
  else if (age < IDLE_WINDOW_MS) status = 'idle';
  else status = 'done';

  const projectPath = cwd || 'unknown';
  const projectName = cwd ? path.basename(cwd) : decodeDirName(path.basename(path.dirname(file)));

  return {
    id: sessionId,
    file,
    project: projectName,
    projectPath,
    model: model || 'unknown',
    version,
    gitBranch,
    status,
    startTime: firstTs,
    lastActivity,
    durationMs: firstTs && lastActivity ? lastActivity - firstTs : null,
    messageCount: userCount + assistantCount,
    userMessageCount: userCount,
    assistantMessageCount: assistantCount,
    toolUseCount,
    tokens: { input: tokensIn, output: tokensOut },
    costUSD: costUSD(model, tokensIn, tokensOut),
    currentTask: lastMainActivity,
    subAgents,
    subAgentCount: subAgents.length,
    tools,
    histo,
  };
}

// Build an ordered list of tool calls with timing, for the session waterfall.
// Each item pairs a tool_use with its matching tool_result (by id).
export function getToolCalls(file, now = Date.now()) {
  const entries = safeReadLines(file);
  const calls = [];
  const byId = new Map();
  const results = new Map(); // id -> { ts, isError }

  for (const e of entries) {
    const ts = asTime(e.timestamp);
    const msg = e.message;
    const sidechain = e.isSidechain === true;
    if (e.type === 'assistant' && msg && Array.isArray(msg.content)) {
      for (const b of msg.content) {
        if (b && b.type === 'tool_use') {
          const d = describeBlock(b);
          const call = {
            id: b.id, name: b.name || 'tool',
            detail: d && d.text ? d.text.replace(`${b.name} — `, '') : '',
            sidechain, start: ts, end: null, durationMs: null,
            status: 'running', isError: false,
          };
          byId.set(b.id, call);
          calls.push(call);
        }
      }
    } else if (e.type === 'user' && msg && Array.isArray(msg.content)) {
      for (const b of msg.content) {
        if (b && b.type === 'tool_result' && b.tool_use_id) {
          results.set(b.tool_use_id, { ts, isError: b.is_error === true });
        }
      }
    }
  }

  for (const call of calls) {
    const r = results.get(call.id);
    if (r) {
      call.end = r.ts;
      call.isError = r.isError;
      call.status = r.isError ? 'error' : 'done';
      if (call.start && r.ts && r.ts >= call.start) call.durationMs = r.ts - call.start;
    } else if (call.start) {
      call.durationMs = now - call.start;
    }
  }

  calls.sort((a, b) => (a.start || 0) - (b.start || 0));
  return calls;
}

// Return a trimmed, render-friendly timeline of the most recent entries.
export function getTimeline(file, limit = 60, now = Date.now()) {
  const entries = safeReadLines(file);
  const items = [];
  for (const e of entries) {
    const ts = asTime(e.timestamp);
    const msg = e.message;
    const sidechain = e.isSidechain === true;
    if (e.type === 'assistant' && msg && Array.isArray(msg.content)) {
      for (const b of msg.content) {
        const d = describeBlock(b);
        if (d) items.push({ ts, role: 'assistant', sidechain, ...d });
      }
    } else if (e.type === 'user' && msg) {
      const c = msg.content;
      if (typeof c === 'string' && c.trim()) {
        items.push({ ts, role: 'user', sidechain, kind: 'user', text: c.trim() });
      } else if (Array.isArray(c)) {
        for (const b of c) {
          if (b && b.type === 'tool_result') {
            const txt = typeof b.content === 'string'
              ? b.content
              : Array.isArray(b.content)
                ? b.content.map((x) => (x && x.text) || '').join(' ')
                : '';
            items.push({ ts, role: 'tool', sidechain, kind: 'result', text: (txt || '').trim(), isError: b.is_error === true });
          } else if (b && b.type === 'text' && b.text) {
            items.push({ ts, role: 'user', sidechain, kind: 'user', text: b.text.trim() });
          }
        }
      }
    }
  }
  return items.slice(-limit);
}

// Encoded dir names look like "-Users-danny-myproject"; best-effort decode.
function decodeDirName(name) {
  if (!name) return 'unknown';
  const parts = name.replace(/^-/, '').split('-');
  return parts[parts.length - 1] || name;
}

// Scan the whole projects directory and return all sessions, grouped by project.
export function scanAll(projectsDir = defaultProjectsDir(), now = Date.now()) {
  const result = { projectsDir, scannedAt: now, projects: [], sessions: [] };
  let dirs;
  try {
    dirs = fs.readdirSync(projectsDir, { withFileTypes: true });
  } catch {
    return { ...result, error: `Không đọc được thư mục: ${projectsDir}` };
  }

  const sessions = [];
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const dirPath = path.join(projectsDir, d.name);
    let files;
    try {
      files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.jsonl'));
    } catch {
      continue;
    }
    for (const f of files) {
      const s = parseSession(path.join(dirPath, f), now);
      if (s.messageCount === 0 && s.subAgentCount === 0) continue;
      sessions.push(s);
    }
  }

  // Group by project path.
  const byProject = new Map();
  for (const s of sessions) {
    const key = s.projectPath;
    if (!byProject.has(key)) {
      byProject.set(key, { path: key, name: s.project, sessions: [] });
    }
    byProject.get(key).sessions.push(s);
  }

  const projects = [...byProject.values()].map((p) => {
    p.sessions.sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
    const running = p.sessions.filter((s) => s.status === 'running').length;
    const runningSubs = p.sessions.reduce(
      (n, s) => n + s.subAgents.filter((x) => x.status === 'running').length,
      0
    );
    return {
      ...p,
      sessionCount: p.sessions.length,
      runningCount: running,
      runningSubCount: runningSubs,
      lastActivity: Math.max(...p.sessions.map((s) => s.lastActivity || 0)),
    };
  });
  projects.sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));

  return { ...result, projects, sessions };
}
