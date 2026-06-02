#!/usr/bin/env node
// LAAM — Local AI Agent Monitoring server.
// Serves the dashboard and streams live updates as Claude session files change.

import express from 'express';
import chokidar from 'chokidar';
import http from 'node:http';
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
// The /chat page talks to the local model THROUGH the logging proxy (so chats
// are tracked like any other local session). Hard-locked to the 7B model.
const PROXY_URL = arg('proxy-url', process.env.LAAM_PROXY_URL || 'http://localhost:11435');
const CHAT_MODEL = process.env.LAAM_CHAT_MODEL || 'qwen2.5-coder:7b';

// System prompt teaching the model WHEN and HOW to emit the rich blocks the
// /chat page can render (charts, maps, GFM tables). Few-shot so a small model
// copies the exact syntax. The fence MUST be ```chart / ```map (never ```json).
const CHAT_SYSTEM = [
  'You are LAAM Chat, a helpful assistant in a web chat UI that can RENDER rich content.',
  'Choose the best output format for the answer:',
  '',
  '1) CHART — to visualize numbers, comparisons, trends, or proportions. Output a fenced code block whose info string is exactly `chart` (NEVER `json`), containing ONE LINE of valid JSON:',
  '{"type":"<bar|line|pie|doughnut|radar|polarArea>","title":"...","data":{"labels":[...],"datasets":[{"label":"...","data":[...]}]}}',
  'Use bar/line for trends & comparisons, pie/doughnut/polarArea for proportions (one dataset), radar for multi-axis profiles.',
  'Example — "so sánh doanh thu 4 quý":',
  '```chart',
  '{"type":"bar","title":"Doanh thu theo quý","data":{"labels":["Q1","Q2","Q3","Q4"],"datasets":[{"label":"Doanh thu","data":[12,19,9,15]}]}}',
  '```',
  '',
  '2) MAP — for places, locations, or directions. Fenced block info string exactly `map`, ONE LINE of valid JSON.',
  'IMPORTANT: You do NOT need to know real coordinates. Just give place NAMES — the app resolves lat/lng automatically (geocoding). Never refuse a map for lack of coordinates. Format:',
  '{"markers":[{"name":"<place>"},...],"directions":{"from":"<place>","to":"<place>"},"zoom":13}',
  'Use `directions` (from/to) when the user asks for directions; use `markers` with `name` to show one or more places. Add lat/lng yourself ONLY if you are certain.',
  'Example — "chỉ đường từ Hồ Gươm tới Văn Miếu":',
  '```map',
  '{"markers":[{"name":"Hồ Gươm, Hà Nội"},{"name":"Văn Miếu, Hà Nội"}],"directions":{"from":"Hồ Gươm, Hà Nội","to":"Văn Miếu, Hà Nội"}}',
  '```',
  '',
  '3) TABLE — to list or compare items in rows/columns. Use a GitHub-flavored Markdown table. DO NOT wrap the table in a code fence.',
  'Example:',
  '| Tên | Năm |',
  '|-----|-----|',
  '| Python | 1991 |',
  '| Go | 2007 |',
  '',
  '4) Otherwise, answer in normal Markdown (headings, lists, **bold**, `code`).',
  '',
  'RULES: A chart/map fence MUST be ```chart or ```map — never ```json or ```. The JSON must be valid and on a single line. Add one short sentence before a chart/map block. Keep the language of the user (Vietnamese if they write Vietnamese). Use a chart/map/table whenever it fits the question instead of describing the data only in prose.',
].join('\n');

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
app.use(express.json({ limit: '2mb' }));
app.use(express.static(PUBLIC));

// Page routes (clean URLs without .html, so nav links stay tidy).
app.get('/agents', (_req, res) => res.sendFile(path.join(PUBLIC, 'agents.html')));
app.get('/graph', (_req, res) => res.sendFile(path.join(PUBLIC, 'graph.html')));
app.get('/search', (_req, res) => res.sendFile(path.join(PUBLIC, 'search.html')));
app.get('/session', (_req, res) => res.sendFile(path.join(PUBLIC, 'session.html')));
app.get('/chat', (_req, res) => res.sendFile(path.join(PUBLIC, 'chat.html')));

// Chat with the local 7B model, streamed THROUGH the logging proxy so the
// conversation is tracked in LAAM as a local session. Model is hard-locked.
app.get('/api/chat/info', (_req, res) => res.json({ model: CHAT_MODEL }));
app.post('/api/chat', (req, res) => {
  const { sessionId, messages } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'messages[] required' });
  }
  const sid = 'chat-' + String(sessionId || 'web').replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 48);
  // Prepend the render-format system prompt unless the caller already set one.
  const outMsgs = messages[0] && messages[0].role === 'system'
    ? messages
    : [{ role: 'system', content: CHAT_SYSTEM }, ...messages];
  const payload = JSON.stringify({ model: CHAT_MODEL, stream: true, messages: outMsgs });
  const u = new URL(PROXY_URL);
  const preq = http.request(
    {
      hostname: u.hostname,
      port: u.port || 80,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
        'x-laam-session': sid,
      },
    },
    (pres) => {
      res.writeHead(pres.statusCode || 200, {
        'content-type': 'application/x-ndjson',
        'cache-control': 'no-cache',
      });
      pres.pipe(res);
    }
  );
  preq.on('error', (e) => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Không kết nối được proxy/Ollama: ' + e.message }));
  });
  // Abort the upstream generation only if the client disconnects mid-stream
  // (Stop button / navigate away) — not on normal completion.
  res.on('close', () => { if (!res.writableEnded) preq.destroy(); });
  preq.write(payload);
  preq.end();
});

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

// Fetch a USER-SUPPLIED URL server-side and return its text, so the chat can
// read web pages. SSRF-guarded: only public http(s) hosts.
function isBlockedHost(host) {
  const h = (host || '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h === '0.0.0.0') return true;
  // Block private / loopback / link-local IPv4 ranges.
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (h.includes(':')) return true; // IPv6 / host:port oddities — be conservative
  return false;
}
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n')
    .trim();
}
app.post('/api/fetch-url', async (req, res) => {
  const raw = String((req.body && req.body.url) || '').trim();
  let u;
  try { u = new URL(raw); } catch { return res.status(400).json({ error: 'URL không hợp lệ' }); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return res.status(400).json({ error: 'Chỉ hỗ trợ http/https' });
  if (isBlockedHost(u.hostname)) return res.status(403).json({ error: 'Chặn địa chỉ nội bộ/loopback' });
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const r = await fetch(u.href, { signal: ctrl.signal, redirect: 'follow', headers: { 'user-agent': 'LAAM-chat/0.1' } });
    clearTimeout(timer);
    const ctype = r.headers.get('content-type') || '';
    const body = await r.text();
    const text = /html/i.test(ctype) ? htmlToText(body) : body;
    const titleMatch = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    res.json({
      url: u.href,
      title: titleMatch ? titleMatch[1].trim().slice(0, 200) : u.hostname,
      text: text.slice(0, 12000),
      truncated: text.length > 12000,
    });
  } catch (e) {
    res.status(502).json({ error: 'Không tải được URL: ' + e.message });
  }
});

// Geocoding via Nominatim (OpenStreetMap) — resolve a place NAME to lat/lng so
// the chat map uses real coordinates instead of the model's guesses. Cached +
// throttled to respect Nominatim's usage policy (≤1 req/s, identifying UA).
const geoCache = new Map(); // lowercased query -> { lat, lng, display } | null
let lastGeoCall = 0;
async function geocodeOne(q) {
  const query = String(q || '').trim();
  if (!query) return null;
  const key = query.toLowerCase();
  if (geoCache.has(key)) return geoCache.get(key);
  const wait = Math.max(0, 1100 - (Date.now() - lastGeoCall));
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastGeoCall = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(query);
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'LAAM-chat/0.1 (local AI agent monitoring; self-host)', 'Accept-Language': 'vi,en' },
    });
    clearTimeout(timer);
    const arr = await r.json();
    const hit = Array.isArray(arr) && arr[0]
      ? { lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon), display: arr[0].display_name }
      : null;
    geoCache.set(key, hit);
    return hit;
  } catch {
    return null; // fail soft — never break the chat flow
  }
}
app.get('/api/geocode', async (req, res) => {
  const hit = await geocodeOne(req.query.q);
  if (!hit) return res.status(404).json({ error: 'không tìm thấy địa điểm' });
  res.json(hit);
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
