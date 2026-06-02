// LAAM — parser for LOCAL model logs written by the Ollama logging proxy.
// Reads ~/.laam/local-logs/<sessionId>.jsonl (one JSON line per completed
// request) and turns each file into a session object shaped like the Claude
// parser's output, tagged source:'local' with costUSD:0 (local = free).

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { RUNNING_WINDOW_MS, IDLE_WINDOW_MS } from './parser.js';

export function defaultLocalLogsDir() {
  return process.env.LAAM_LOCAL_LOGS || path.join(os.homedir(), '.laam', 'local-logs');
}

export const LOCAL_PROJECT_PATH = 'ollama://local';
export const LOCAL_PROJECT_NAME = 'Ollama (local)';

function readLines(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return []; }
  const out = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t)); } catch { /* skip partial line */ }
  }
  return out;
}

// Build one session summary from a proxy log file's lines.
function parseLocalSession(file, now) {
  const events = readLines(file);
  if (!events.length) return null;

  const id = path.basename(file, '.jsonl');
  let model = 'local';
  let firstTs = null, lastTs = null;
  let tokensIn = 0, tokensOut = 0;
  let userCount = 0, assistantCount = 0, errorCount = 0;
  let lastText = null, lastUser = null;
  const histo = {};

  for (const e of events) {
    if (e.model) model = e.model;
    const ts = typeof e.ts === 'number' ? e.ts : null;
    const end = typeof e.endTs === 'number' ? e.endTs : ts;
    if (ts != null) {
      if (firstTs == null || ts < firstTs) firstTs = ts;
      const dt = new Date(ts);
      const key = `${dt.getDay()}_${dt.getHours()}`;
      histo[key] = (histo[key] || 0) + 1;
    }
    if (end != null && (lastTs == null || end > lastTs)) lastTs = end;

    tokensIn += e.tokensIn || 0;
    tokensOut += e.tokensOut || 0;

    // Count a user turn + an assistant turn per request.
    const req = e.request || {};
    if (Array.isArray(req.messages)) {
      const users = req.messages.filter((m) => m && m.role === 'user');
      userCount += users.length || 1;
      const lastU = users[users.length - 1];
      if (lastU && typeof lastU.content === 'string') lastUser = lastU.content;
    } else if (req.prompt) {
      userCount += 1;
      lastUser = String(req.prompt);
    } else {
      userCount += 1;
    }
    if (e.status === 'error') errorCount += 1;
    else { assistantCount += 1; if (e.responseText) lastText = e.responseText; }
  }

  const lastActivity = lastTs || firstTs || null;
  const age = lastActivity != null ? now - lastActivity : Infinity;
  let status;
  if (age < RUNNING_WINDOW_MS) status = 'running';
  else if (age < IDLE_WINDOW_MS) status = 'idle';
  else status = 'done';

  const currentTask = lastText
    ? { kind: 'text', text: lastText.slice(0, 280) }
    : (lastUser ? { kind: 'user', text: lastUser.slice(0, 280) } : null);

  return {
    id,
    file,
    source: 'local',
    project: LOCAL_PROJECT_NAME,
    projectPath: LOCAL_PROJECT_PATH,
    model,
    version: 'ollama',
    gitBranch: null,
    status,
    startTime: firstTs,
    lastActivity,
    durationMs: firstTs && lastActivity ? lastActivity - firstTs : null,
    messageCount: userCount + assistantCount,
    userMessageCount: userCount,
    assistantMessageCount: assistantCount,
    toolUseCount: 0,
    tokens: { input: tokensIn, output: tokensOut },
    costUSD: 0, // local models are free
    currentTask,
    subAgents: [],
    subAgentCount: 0,
    tools: [],
    histo,
    errorCount,
  };
}

// Scan the local-logs directory and return { dir, sessions, projects } where
// `projects` holds the single grouped "Ollama (local)" project (or empty).
export function scanLocal(dir = defaultLocalLogsDir(), now = Date.now()) {
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
  } catch {
    return { dir, sessions: [], projects: [] };
  }

  const sessions = [];
  for (const f of files) {
    const s = parseLocalSession(path.join(dir, f), now);
    if (s && s.messageCount > 0) sessions.push(s);
  }
  if (!sessions.length) return { dir, sessions: [], projects: [] };

  sessions.sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
  const running = sessions.filter((s) => s.status === 'running').length;
  const project = {
    path: LOCAL_PROJECT_PATH,
    name: LOCAL_PROJECT_NAME,
    source: 'local',
    sessions,
    sessionCount: sessions.length,
    runningCount: running,
    runningSubCount: 0,
    lastActivity: Math.max(...sessions.map((s) => s.lastActivity || 0)),
  };
  return { dir, sessions, projects: [project] };
}

// A render-friendly timeline for a single local session (used by /api/session/:id).
export function getLocalTimeline(file, limit = 80) {
  const events = readLines(file);
  const items = [];
  for (const e of events) {
    const ts = typeof e.ts === 'number' ? e.ts : null;
    const req = e.request || {};
    if (Array.isArray(req.messages)) {
      const lastU = [...req.messages].reverse().find((m) => m && m.role === 'user');
      if (lastU && lastU.content) items.push({ ts, role: 'user', kind: 'user', text: String(lastU.content).trim() });
    } else if (req.prompt) {
      items.push({ ts, role: 'user', kind: 'user', text: String(req.prompt).trim() });
    }
    if (e.status === 'error') {
      items.push({ ts: e.endTs || ts, role: 'tool', kind: 'result', text: e.error || 'error', isError: true });
    } else if (e.responseText) {
      items.push({ ts: e.endTs || ts, role: 'assistant', kind: 'text', text: String(e.responseText).trim() });
    }
  }
  return items.slice(-limit);
}
