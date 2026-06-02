#!/usr/bin/env node
// LAAM — Local AI Agent Monitoring server.
// Serves the dashboard and streams live updates as Claude session files change.

import express from 'express';
import chokidar from 'chokidar';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scanAll, getTimeline, getToolCalls, defaultProjectsDir } from '../lib/parser.js';
import { scanLocal, getLocalTimeline, defaultLocalLogsDir } from '../lib/localParser.js';
import { computeStats } from '../lib/stats.js';
import { searchTranscripts } from '../lib/search.js';
import { PRICE_UPDATED } from '../lib/pricing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ---- CLI args ----------------------------------------------------------
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const PORT = Number(arg('port', process.env.LAAM_PORT || process.env.PORT || 4317));
const PROJECTS_DIR = arg('dir', defaultProjectsDir());
// Second data source: local-model logs written by the Ollama logging proxy.
const LOCAL_LOGS_DIR = arg('local', process.env.LAAM_LOCAL_LOGS || defaultLocalLogsDir());
// A session that hasn't written its transcript for this many minutes while
// still not "done" is flagged as potentially stuck. Configurable.
const STUCK_THRESHOLD_MIN = Number(arg('stuck', process.env.LAAM_STUCK_MIN || 10));

// Unified scan: Claude transcripts + local-model proxy logs, merged into one
// snapshot ({ projects, sessions }) consumed by every endpoint.
function scan(now = Date.now()) {
  const claude = scanAll(PROJECTS_DIR, now);
  const local = scanLocal(LOCAL_LOGS_DIR, now);
  return {
    projectsDir: PROJECTS_DIR,
    localLogsDir: LOCAL_LOGS_DIR,
    scannedAt: now,
    projects: [...claude.projects, ...local.projects].sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0)),
    sessions: [...claude.sessions, ...local.sessions],
    error: claude.error,
  };
}

// ---- App ---------------------------------------------------------------
const app = express();
const PUBLIC = path.join(ROOT, 'public');
app.use(express.static(PUBLIC));

// Page routes (clean URLs without .html, so nav links stay tidy).
app.get('/agents', (_req, res) => res.sendFile(path.join(PUBLIC, 'agents.html')));
app.get('/graph', (_req, res) => res.sendFile(path.join(PUBLIC, 'graph.html')));
app.get('/search', (_req, res) => res.sendFile(path.join(PUBLIC, 'search.html')));
app.get('/session', (_req, res) => res.sendFile(path.join(PUBLIC, 'session.html')));

app.get('/api/sessions', (_req, res) => {
  res.json(scan());
});

app.get('/api/stats', (_req, res) => {
  res.json(computeStats(scan()));
});

// Runtime config for the client (stuck threshold, pricing note).
app.get('/api/config', (_req, res) => {
  res.json({ stuckThresholdMin: STUCK_THRESHOLD_MIN, pricingUpdated: PRICE_UPDATED });
});

// Full-text search across transcript content.
app.get('/api/search', (req, res) => {
  const q = String(req.query.q || '');
  const limit = Math.min(500, Number(req.query.limit) || 200);
  res.json(searchTranscripts(scan(), q, { limit }));
});

app.get('/api/session/:id', (req, res) => {
  const data = scan();
  const s = data.sessions.find((x) => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'not found' });
  if (s.source === 'local') {
    res.json({ ...s, timeline: getLocalTimeline(s.file), toolCalls: [] });
  } else {
    res.json({ ...s, timeline: getTimeline(s.file), toolCalls: getToolCalls(s.file) });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    projectsDir: PROJECTS_DIR,
    exists: fs.existsSync(PROJECTS_DIR),
    localLogsDir: LOCAL_LOGS_DIR,
    localExists: fs.existsSync(LOCAL_LOGS_DIR),
  });
});

// ---- SSE live stream ---------------------------------------------------
const clients = new Set();

app.get('/api/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders?.();
  res.write(`event: snapshot\ndata: ${JSON.stringify(scan())}\n\n`);
  clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    clients.delete(res);
  });
});

function broadcast() {
  if (clients.size === 0) return;
  const payload = `event: snapshot\ndata: ${JSON.stringify(scan())}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch { clients.delete(res); }
  }
}

// Debounce rapid file changes into a single broadcast.
let pending = null;
function scheduleBroadcast() {
  if (pending) return;
  pending = setTimeout(() => {
    pending = null;
    broadcast();
  }, 300);
}

// ---- Watcher -----------------------------------------------------------
const watchPaths = [];
if (fs.existsSync(PROJECTS_DIR)) watchPaths.push(PROJECTS_DIR);
else console.warn(`[laam] ⚠  Projects dir không tồn tại: ${PROJECTS_DIR}`);
if (fs.existsSync(LOCAL_LOGS_DIR)) watchPaths.push(LOCAL_LOGS_DIR);

if (watchPaths.length) {
  const watcher = chokidar.watch(watchPaths, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    depth: 2,
  });
  watcher.on('all', scheduleBroadcast);
}

// Re-broadcast periodically so "running → idle" transitions update even
// when no file changes (status is time-based).
setInterval(broadcast, 15000);

app.listen(PORT, () => {
  console.log(`\n  LAAM — Local AI Agent Monitoring`);
  console.log(`  ▶  http://localhost:${PORT}`);
  console.log(`  ▶  Claude transcripts: ${PROJECTS_DIR}`);
  console.log(`  ▶  Local model logs:   ${LOCAL_LOGS_DIR}\n`);
});
