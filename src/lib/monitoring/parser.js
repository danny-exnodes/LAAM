// LAAM — session parser for Claude Code / Agent SDK JSONL transcripts.
// Reads ~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl files and turns
// each into a structured "agent session" model the dashboard can render.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { costUSD } from './pricing.js';

// Sub-agent output text limit before storing in agent_sessions.subAgents jsonb.
// subAgents is org-broadcast via SSE — unbounded output could leak large secrets or PII.
const OUTPUT_TEXT_MAX = 500;

// Redact credential-looking substrings from sub-agent outputText before it is
// stored in agent_sessions.subAgents jsonb (org-broadcast via SSE).
// Mirrors the patterns in src/lib/agent/safety/redact.ts — kept inline so
// parser.js stays a zero-external-import server module.
const REDACT_PLACEHOLDER = '‹redacted›';
function redactOutputText(s) {
  return s
    .replace(/([?&](?:key|token|api_key|access_token|password|secret)=)[^&\s"']+/gi,
      (_m, p1) => `${p1}${REDACT_PLACEHOLDER}`)
    .replace(/(Bearer\s+)[\w.\-]+/gi, (_m, p1) => `${p1}${REDACT_PLACEHOLDER}`)
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, () => REDACT_PLACEHOLDER);
}

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
  const resultOutputs = new Map(); // tool_use_id -> bounded+redacted output text
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
            // F4: capture bounded+redacted output for Task results.
            // outputText flows into agent_sessions.subAgents jsonb (org-broadcast via SSE).
            // Redact FIRST (full string), then bound — ensures secrets near the 500-char
            // boundary are not truncated before being scrubbed.
            if (taskCalls.has(b.tool_use_id)) {
              const raw = typeof b.content === 'string'
                ? b.content
                : Array.isArray(b.content)
                  ? b.content.map((x) => (x && typeof x.text === 'string' ? x.text : '')).join(' ')
                  : '';
              if (raw) {
                resultOutputs.set(b.tool_use_id, redactOutputText(raw).slice(0, OUTPUT_TEXT_MAX));
              }
            }
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
      isError: resultErrors.has(t.id),
      // F4: bounded (≤500 chars) + redacted output from the Task tool_result.
      // null when the sub-agent is still running or produced no text output.
      // Note: parent→child tree link (parentToolUseId) was dropped — parent_tool_use_id
      // does NOT exist on real sidechain entries; real field is parentUuid/agentId.
      // See backlog: .serena/memories/backlog/subagent-parent-link.md
      outputText: resultOutputs.get(t.id) ?? null,
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
    source: 'claude',
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

// Per-file parse cache: scanAll() runs on every POST /api/sync, but most
// transcripts are unchanged between scans — re-reading + re-parsing every
// JSONL file each time is the dominant cost. A file whose mtimeMs AND size
// both match the cached entry is served from cache with only the
// time-dependent fields recomputed (see withFreshStatus). The cache is
// module-level: one per process, pruned to the files seen by the last scan.
const scanCache = new Map(); // file path -> { mtimeMs, size, parsed }

/** Drop all cached parse results (tests / diagnostics). */
export function clearScanCache() {
  scanCache.clear();
}

/** Number of cached files (tests / diagnostics). */
export function scanCacheSize() {
  return scanCache.size;
}

// Recompute the `now`-dependent fields of a cached session. Everything else
// only changes when the file changes, but status (running/idle/done) and the
// durations of still-running sub-agents are measured against `now` — serving
// them stale would freeze a finished agent as "running" forever.
function withFreshStatus(parsed, mtimeMs, now) {
  const subAgents = parsed.subAgents.map((s) =>
    s.status === 'running' && s.startTime ? { ...s, durationMs: now - s.startTime } : s
  );
  const age = parsed.lastActivity != null ? now - parsed.lastActivity : Infinity;
  const fileFresh = mtimeMs != null ? now - mtimeMs < RUNNING_WINDOW_MS : false;
  const hasRunningSub = subAgents.some((s) => s.status === 'running');

  let status;
  if (age < RUNNING_WINDOW_MS || (fileFresh && hasRunningSub)) status = 'running';
  else if (age < IDLE_WINDOW_MS) status = 'idle';
  else status = 'done';

  return { ...parsed, status, subAgents };
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
  const seen = new Set();
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
      const filePath = path.join(dirPath, f);
      seen.add(filePath);
      // Stat BEFORE parsing: if the file is appended between stat and read we
      // cache the new content under the old mtime, so the next scan re-parses
      // (safe direction — never serve stale content).
      let stat = null;
      try {
        stat = fs.statSync(filePath);
      } catch {
        // file disappeared between readdir and stat — parse below yields empty
      }
      const hit = stat ? scanCache.get(filePath) : null;
      let s;
      if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) {
        s = withFreshStatus(hit.parsed, hit.mtimeMs, now);
      } else {
        s = parseSession(filePath, now);
        if (stat) scanCache.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, parsed: s });
      }
      if (s.messageCount === 0 && s.subAgentCount === 0) continue;
      sessions.push(s);
    }
  }

  // Prune cache entries for files that disappeared from disk.
  for (const key of scanCache.keys()) {
    if (!seen.has(key)) scanCache.delete(key);
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
