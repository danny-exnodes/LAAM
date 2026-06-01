#!/usr/bin/env node
// LAAM — Local AI Agent Monitoring server.
// Serves the dashboard and streams live updates as Claude session files change.

import express from 'express';
import chokidar from 'chokidar';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scanAll, getTimeline, defaultProjectsDir } from '../lib/parser.js';
import { computeStats } from '../lib/stats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ---- CLI args ----------------------------------------------------------
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const PORT = Number(arg('port', process.env.LAAM_PORT || process.env.PORT || 4317));
const PROJECTS_DIR = arg('dir', defaultProjectsDir());

// ---- App ---------------------------------------------------------------
const app = express();
const PUBLIC = path.join(ROOT, 'public');
app.use(express.static(PUBLIC));

// Page routes (clean URLs without .html, so nav links stay tidy).
app.get('/agents', (_req, res) => res.sendFile(path.join(PUBLIC, 'agents.html')));
app.get('/graph', (_req, res) => res.sendFile(path.join(PUBLIC, 'graph.html')));

app.get('/api/sessions', (_req, res) => {
  res.json(scanAll(PROJECTS_DIR));
});

app.get('/api/stats', (_req, res) => {
  res.json(computeStats(scanAll(PROJECTS_DIR)));
});

app.get('/api/session/:id', (req, res) => {
  const data = scanAll(PROJECTS_DIR);
  const s = data.sessions.find((x) => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'not found' });
  res.json({ ...s, timeline: getTimeline(s.file) });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, projectsDir: PROJECTS_DIR, exists: fs.existsSync(PROJECTS_DIR) });
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
  res.write(`event: snapshot\ndata: ${JSON.stringify(scanAll(PROJECTS_DIR))}\n\n`);
  clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    clients.delete(res);
  });
});

function broadcast() {
  if (clients.size === 0) return;
  const payload = `event: snapshot\ndata: ${JSON.stringify(scanAll(PROJECTS_DIR))}\n\n`;
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
if (fs.existsSync(PROJECTS_DIR)) {
  const watcher = chokidar.watch(PROJECTS_DIR, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    depth: 2,
  });
  watcher.on('all', scheduleBroadcast);
} else {
  console.warn(`[laam] ⚠  Projects dir không tồn tại: ${PROJECTS_DIR}`);
}

// Re-broadcast periodically so "running → idle" transitions update even
// when no file changes (status is time-based).
setInterval(broadcast, 15000);

app.listen(PORT, () => {
  console.log(`\n  LAAM — Local AI Agent Monitoring`);
  console.log(`  ▶  http://localhost:${PORT}`);
  console.log(`  ▶  Watching: ${PROJECTS_DIR}\n`);
});
