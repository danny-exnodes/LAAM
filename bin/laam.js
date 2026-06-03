#!/usr/bin/env node
// LAAM — Local AI Agent Monitoring server.
// Serves the dashboard and streams live updates as Claude session files change.

import express from 'express';
import chokidar from 'chokidar';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scanAll, getTimeline, getToolCalls, defaultProjectsDir } from '../lib/parser.js';
import { scanLocal, getLocalTimeline, defaultLocalLogsDir } from '../lib/localParser.js';
import { computeStats } from '../lib/stats.js';
import { searchTranscripts } from '../lib/search.js';
import { PRICE_UPDATED } from '../lib/pricing.js';
import * as connectors from '../lib/connectors/index.js';

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
// Default chat model: an all-round daily-assistant with reliable tool/function
// calling (for connectors) AND vision (reads images/scanned docs natively).
// qwen3-vl:8b — the most CONSISTENT tool-caller (6/6 every trial; gemma4:e4b is
// faster but drops the email tool 2/3 runs), plus vision and more 16GB headroom.
const CHAT_MODEL = process.env.LAAM_CHAT_MODEL || 'qwen3-vl:8b';

// System prompt teaching the model WHEN and HOW to emit the rich blocks the
// /chat page can render (charts, maps, GFM tables). Few-shot so a small model
// copies the exact syntax. The fence MUST be ```chart / ```map (never ```json).
const CHAT_SYSTEM = [
  'You are LAAM, a friendly everyday-work assistant in a web chat UI. You help with daily tasks',
  'for a general user (NOT a coding bot): finding and reading documents (including scanned/photographed',
  'files, whose text is provided to you), answering questions, summarising, planning, scheduling, and',
  'quick analysis. You can RENDER rich content and call tools/connectors when they are available.',
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
  'CURRENT LOCATION: when the START of the directions is the user themselves — they say "từ đây", "đây", "vị trí của tôi", "chỗ tôi", "from here", "my location", "当前位置" — OR they give ONLY a destination with no starting point ("dẫn đường đến X", "đường tới X", "how to get to X"), set `"from":"current"`. The app reads the device GPS and routes from the user\'s real position; do NOT invent a starting place.',
  'Example — "dẫn đường từ đây đến Bắc Ninh":',
  '```map',
  '{"directions":{"from":"current","to":"Bắc Ninh, Việt Nam"}}',
  '```',
  'Example — "dẫn đường đến Bắc Ninh" (no start given → start from the user):',
  '```map',
  '{"directions":{"from":"current","to":"Bắc Ninh, Việt Nam"}}',
  '```',
  'NEARBY PLACES: when the user asks to find places AROUND THEM — "quán cafe quanh đây", "nhà hàng gần đây", "find 10 cafes near me", "我附近的咖啡店" — emit a map block with a `nearby` object. The app reads the device GPS, queries real places (OpenStreetMap) and renders the list + markers itself. Do NOT invent place names. Format:',
  '{"nearby":{"query":"<category, e.g. cafe>","limit":<N, default 10>}}',
  'Example — "tìm 10 quán cafe quanh đây":',
  '```map',
  '{"nearby":{"query":"cafe","limit":10}}',
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
  'RULES: A chart/map fence MUST be ```chart or ```map — never ```json or ```. The JSON must be valid and on a single line. Add one short sentence before a chart/map block. Use a chart/map/table whenever it fits the question instead of describing the data only in prose.',
].join('\n');

// A forceful per-request language directive (prepended to the system prompt).
// Fixes the model drifting into English / injecting Chinese characters.
const LANG_NAMES = { vi: 'Vietnamese (Tiếng Việt)', en: 'English', zh: 'Simplified Chinese (简体中文)' };
function langDirective(lang) {
  const name = LANG_NAMES[lang];
  if (!name) return '';
  return [
    '=== LANGUAGE (highest priority) ===',
    'You MUST write your ENTIRE reply in ' + name + '.',
    'Match the language of the user; when in doubt, use ' + name + '.',
    'NEVER mix languages and NEVER output Chinese characters unless ' + name + ' IS Chinese.',
    'This includes prose, list items, table headers, and the sentence before any chart/map block.',
    '',
    '',
  ].join('\n');
}

// Inject the user's real position (from the device GPS, reverse-geocoded by the
// client) so the model answers location questions instead of refusing.
function locationDirective(loc) {
  if (!loc || typeof loc !== 'object' || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return '';
  const addr = (typeof loc.address === 'string' && loc.address.trim()) ? loc.address.trim() : '';
  return [
    '=== USER LOCATION (known — use it, do NOT refuse) ===',
    'The user has shared their current device location:',
    (addr ? '  Address: ' + addr : '') ,
    '  Coordinates: ' + loc.lat.toFixed(5) + ', ' + loc.lng.toFixed(5),
    'When the user asks about "here / around here / nearby / near me / my location / my coordinates / quanh đây / gần đây / vị trí của tôi / 附近 / 我的位置", USE this location to answer directly. You DO know where they are — never say you lack their location.',
    'For "what are my coordinates", state the coordinates (and address) above.',
    'To list real places around them, emit a ```map block with {"nearby":{"query":"...","limit":N}} — the app fills in real results.',
    '',
    '',
  ].filter(Boolean).join('\n');
}

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
app.use(express.json({ limit: '16mb' })); // generous: OCR posts base64 page images
app.use(express.static(PUBLIC));

// Page routes (clean URLs without .html, so nav links stay tidy).
app.get('/agents', (_req, res) => res.sendFile(path.join(PUBLIC, 'agents.html')));
app.get('/graph', (_req, res) => res.sendFile(path.join(PUBLIC, 'graph.html')));
app.get('/search', (_req, res) => res.sendFile(path.join(PUBLIC, 'search.html')));
app.get('/session', (_req, res) => res.sendFile(path.join(PUBLIC, 'session.html')));
app.get('/chat', (_req, res) => res.sendFile(path.join(PUBLIC, 'chat.html')));
app.get('/office', (_req, res) => res.sendFile(path.join(PUBLIC, 'office.html')));
app.get('/connectors', (_req, res) => res.sendFile(path.join(PUBLIC, 'connectors.html')));

// ---- Connectors API ------------------------------------------------------
app.get('/api/connectors', (_req, res) => res.json({ connectors: connectors.list() }));
app.post('/api/connectors/:id/connect', (req, res) => {
  const r = connectors.connect(req.params.id, (req.body && req.body.fields) || {});
  res.status(r.ok ? 200 : 400).json(r);
});
app.post('/api/connectors/:id/disconnect', (req, res) => res.json(connectors.disconnect(req.params.id)));
app.post('/api/connectors/:id/test', async (req, res) => {
  const r = await connectors.testConnector(req.params.id);
  res.status(r.ok ? 200 : 400).json(r);
});

// Chat with the local model, streamed THROUGH the logging proxy so the
// conversation is tracked in LAAM as a local session. Model defaults to the
// hard-locked CHAT_MODEL but the client may override it (and gen params).
app.get('/api/chat/info', (_req, res) => res.json({ model: CHAT_MODEL }));

// List the models Ollama has available (powers the model dropdown). Proxies the
// proxy's /api/tags. Fails soft with 502 so the UI can show a friendly error.
app.get('/api/ollama/models', async (_req, res) => {
  try {
    const r = await fetch(`${PROXY_URL}/api/tags`);
    const data = await r.json();
    res.json(data && typeof data === 'object' ? data : { models: [] });
  } catch (e) {
    res.status(502).json({ error: 'Không lấy được danh sách mô hình: ' + e.message });
  }
});

app.post('/api/chat', async (req, res) => {
  const body = req.body || {};
  const { sessionId, messages } = body;
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'messages[] required' });
  }
  const sid = 'chat-' + String(sessionId || 'web').replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 48);
  // Honor an optional client-chosen model; fall back to the hard-locked default.
  const model = (typeof body.model === 'string' && body.model) ? body.model : CHAT_MODEL;
  // Honor an optional custom system prompt (else the render-format default), then
  // FORCE the reply language so the model never drifts to English/Chinese.
  const baseSys = (typeof body.system === 'string' && body.system.trim()) ? body.system : CHAT_SYSTEM;
  const sysPrompt = langDirective(body.lang) + locationDirective(body.location) + baseSys;
  // Prepend the system prompt unless the caller already set one.
  const outMsgs = messages[0] && messages[0].role === 'system'
    ? messages
    : [{ role: 'system', content: sysPrompt }, ...messages];
  const options = (body.options && typeof body.options === 'object') ? body.options : null;

  // ---- Connector tool-calling loop -------------------------------------
  // If any connector is connected, expose its tools to the model. We run the
  // tool rounds NON-streaming (to capture tool_calls), execute the real APIs,
  // feed the results back, and stream the final answer as NDJSON.
  const tools = connectors.chatTools();
  if (tools.length) {
    res.writeHead(200, { 'content-type': 'application/x-ndjson', 'cache-control': 'no-cache' });
    const ndjson = (o) => { try { res.write(JSON.stringify(o) + '\n'); } catch (e) {} };
    const convo = outMsgs.slice();
    async function round(withTools) {
      const reqBody = { model, stream: false, think: false, messages: convo };
      if (options) reqBody.options = options;
      if (withTools) reqBody.tools = tools;
      const r = await fetch(PROXY_URL + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', 'x-laam-session': sid }, body: JSON.stringify(reqBody) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }
    try {
      let final = null;
      for (let i = 0; i < 4; i++) {
        const j = await round(i < 3);
        const msg = j.message || {};
        const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
        if (calls.length && i < 3) {
          convo.push({ role: 'assistant', content: msg.content || '', tool_calls: calls });
          for (const tc of calls) {
            const name = tc.function && tc.function.name;
            ndjson({ tool: name, args: tc.function && tc.function.arguments }); // client shows a "calling …" chip
            const result = await connectors.execute(name, tc.function && tc.function.arguments);
            convo.push({ role: 'tool', tool_name: name, content: JSON.stringify(result).slice(0, 6000) });
          }
          continue;
        }
        final = j; break;
      }
      const content = (final && final.message && final.message.content) || '';
      ndjson({ message: { content } });
      ndjson({ done: true, model, eval_count: final && final.eval_count, eval_duration: final && final.eval_duration });
      res.end();
    } catch (e) {
      ndjson({ error: 'Lỗi connector/chat: ' + (e && e.message ? e.message : String(e)) });
      res.end();
    }
    return;
  }

  // ---- No connectors → plain token streaming (unchanged) ----------------
  const out = { model, stream: true, messages: outMsgs };
  if (options) out.options = options;
  const payload = JSON.stringify(out);
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

// ---- Road routing (real driving geometry, keyless) ----------------------
// Proxies the public OSRM demo server so the browser avoids CORS, and adds a
// small cache + gentle throttle to respect the free service. Fail-soft: a 502
// lets the client fall back to a straight line.
const routeCache = new Map(); // "lng,lat;lng,lat" -> { geometry:[[lat,lng]], distance, duration } | null
let lastRouteCall = 0;
async function routeOne(coords) { // coords: [[lng,lat], ...] (OSRM order), >= 2
  const key = coords.map((c) => c.join(',')).join(';');
  if (routeCache.has(key)) return routeCache.get(key);
  const wait = Math.max(0, 600 - (Date.now() - lastRouteCall));
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastRouteCall = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const seg = coords.map((c) => c[0] + ',' + c[1]).join(';');
    const url = 'https://router.project-osrm.org/route/v1/driving/' + seg + '?overview=full&geometries=geojson';
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'LAAM-chat/0.1 (local AI agent monitoring; self-host)' } });
    clearTimeout(timer);
    const j = await r.json();
    const route = j && Array.isArray(j.routes) && j.routes[0];
    const coordsOut = route && route.geometry && Array.isArray(route.geometry.coordinates) ? route.geometry.coordinates : null;
    const hit = coordsOut && coordsOut.length > 1
      ? { geometry: coordsOut.map((c) => [c[1], c[0]]), distance: route.distance, duration: route.duration } // [lng,lat] -> [lat,lng]
      : null;
    routeCache.set(key, hit);
    return hit;
  } catch {
    return null; // fail soft — client draws a straight line instead
  }
}
app.get('/api/route', async (req, res) => {
  const toPair = (s) => { const p = String(s || '').split(','); const lat = parseFloat(p[0]); const lng = parseFloat(p[1]); return (isFinite(lat) && isFinite(lng)) ? [lng, lat] : null; };
  let coords = [];
  if (req.query.points) coords = String(req.query.points).split(';').map(toPair).filter(Boolean);
  else { const f = toPair(req.query.from); const t = toPair(req.query.to); if (f) coords.push(f); if (t) coords.push(t); }
  if (coords.length < 2) return res.status(400).json({ error: 'cần điểm đầu và điểm cuối' });
  if (coords.length > 8) coords = coords.slice(0, 8); // sanity cap
  const hit = await routeOne(coords);
  if (!hit) return res.status(502).json({ error: 'không lấy được tuyến đường' });
  res.json(hit);
});

// ---- Reverse geocode (coords -> address), for location awareness ---------
const revCache = new Map(); // "lat,lng" (rounded) -> { address, lat, lng } | null
async function reverseOne(lat, lng) {
  const key = lat.toFixed(4) + ',' + lng.toFixed(4);
  if (revCache.has(key)) return revCache.get(key);
  const wait = Math.max(0, 1100 - (Date.now() - lastGeoCall));
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastGeoCall = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const url = 'https://nominatim.openstreetmap.org/reverse?format=json&zoom=16&addressdetails=1&lat=' + encodeURIComponent(lat) + '&lon=' + encodeURIComponent(lng);
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'LAAM-chat/0.1 (local AI agent monitoring; self-host)', 'Accept-Language': 'vi,en' } });
    clearTimeout(timer);
    const j = await r.json();
    const hit = j && j.display_name ? { address: j.display_name, lat: lat, lng: lng } : null;
    revCache.set(key, hit);
    return hit;
  } catch {
    return null;
  }
}
app.get('/api/reverse', async (req, res) => {
  const lat = parseFloat(req.query.lat), lng = parseFloat(req.query.lng);
  if (!isFinite(lat) || !isFinite(lng)) return res.status(400).json({ error: 'cần lat & lng' });
  const hit = await reverseOne(lat, lng);
  if (!hit) return res.status(404).json({ error: 'không tra được địa chỉ' });
  res.json(hit);
});

// ---- Nearby POI search (real places around the user) via Overpass --------
// Maps a free-text category to OSM tag filters; unknown queries fall back to a
// viewbox-bounded Nominatim search. Keyless, cached, timed-out, fail-soft.
const POI_TAGS = {
  cafe: ['amenity=cafe'], 'coffee': ['amenity=cafe'], 'quán cafe': ['amenity=cafe'], 'cà phê': ['amenity=cafe'], 'càphê': ['amenity=cafe'], '咖啡': ['amenity=cafe'], '咖啡店': ['amenity=cafe'],
  restaurant: ['amenity=restaurant'], 'nhà hàng': ['amenity=restaurant'], 'quán ăn': ['amenity=restaurant', 'amenity=fast_food'], '餐厅': ['amenity=restaurant'], '饭店': ['amenity=restaurant'],
  bar: ['amenity=bar', 'amenity=pub'], 'quán bar': ['amenity=bar', 'amenity=pub'], '酒吧': ['amenity=bar', 'amenity=pub'],
  atm: ['amenity=atm'], 'cây atm': ['amenity=atm'], 'máy atm': ['amenity=atm'], '取款机': ['amenity=atm'],
  bank: ['amenity=bank'], 'ngân hàng': ['amenity=bank'], '银行': ['amenity=bank'],
  pharmacy: ['amenity=pharmacy'], 'nhà thuốc': ['amenity=pharmacy'], 'hiệu thuốc': ['amenity=pharmacy'], '药店': ['amenity=pharmacy'], '药房': ['amenity=pharmacy'],
  hospital: ['amenity=hospital'], 'bệnh viện': ['amenity=hospital'], '医院': ['amenity=hospital'],
  hotel: ['tourism=hotel', 'tourism=guest_house'], 'khách sạn': ['tourism=hotel', 'tourism=guest_house'], 'nhà nghỉ': ['tourism=guest_house', 'tourism=hotel'], '酒店': ['tourism=hotel'], '宾馆': ['tourism=hotel'],
  fuel: ['amenity=fuel'], 'cây xăng': ['amenity=fuel'], 'trạm xăng': ['amenity=fuel'], 'xăng': ['amenity=fuel'], '加油站': ['amenity=fuel'],
  supermarket: ['shop=supermarket', 'shop=convenience'], 'siêu thị': ['shop=supermarket'], 'tạp hoá': ['shop=convenience'], '超市': ['shop=supermarket'],
  parking: ['amenity=parking'], 'bãi đỗ xe': ['amenity=parking'], 'bãi đỗ': ['amenity=parking'], '停车场': ['amenity=parking'],
  hospital_clinic: ['amenity=clinic'],
  school: ['amenity=school'], 'trường học': ['amenity=school'], '学校': ['amenity=school'],
  park: ['leisure=park'], 'công viên': ['leisure=park'], '公园': ['leisure=park'],
  toilet: ['amenity=toilets'], 'nhà vệ sinh': ['amenity=toilets'], '厕所': ['amenity=toilets'], '洗手间': ['amenity=toilets'],
  bus: ['highway=bus_stop', 'amenity=bus_station'], 'bến xe buýt': ['amenity=bus_station', 'highway=bus_stop'], 'trạm xe buýt': ['highway=bus_stop'], '公交站': ['highway=bus_stop'],
};
function poiTagsFor(q) {
  const key = String(q || '').trim().toLowerCase();
  if (POI_TAGS[key]) return POI_TAGS[key];
  for (const k in POI_TAGS) { if (k.length > 2 && key.indexOf(k) >= 0) return POI_TAGS[k]; }
  return null;
}
function haversine(aLat, aLng, bLat, bLng) {
  const R = 6371000, toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}
let lastOverpass = 0;
async function nearbyOverpass(lat, lng, tags, radius) {
  const filters = tags.map((t) => {
    const i = t.indexOf('='); const k = t.slice(0, i), v = t.slice(i + 1);
    return `node["${k}"="${v}"](around:${radius},${lat},${lng});way["${k}"="${v}"](around:${radius},${lat},${lng});`;
  }).join('');
  const ql = `[out:json][timeout:18];(${filters});out center 60;`;
  const wait = Math.max(0, 1000 - (Date.now() - lastOverpass));
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastOverpass = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  const r = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST', signal: ctrl.signal,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'LAAM-chat/0.1 (self-host)' },
    body: 'data=' + encodeURIComponent(ql),
  });
  clearTimeout(timer);
  const j = await r.json();
  const els = Array.isArray(j.elements) ? j.elements : [];
  const out = [];
  for (const e of els) {
    const p = e.type === 'node' ? { lat: e.lat, lng: e.lon } : (e.center ? { lat: e.center.lat, lng: e.center.lon } : null);
    if (!p) continue;
    const name = (e.tags && (e.tags.name || e.tags['name:en'] || e.tags['name:vi'])) || null;
    if (!name) continue; // skip unnamed POIs — not useful to list
    out.push({ name, lat: p.lat, lng: p.lng, dist: haversine(lat, lng, p.lat, p.lng), kind: e.tags.amenity || e.tags.shop || e.tags.tourism || e.tags.leisure || null });
  }
  // de-dup by name+rounded coords, sort by distance
  const seen = new Set(), dedup = [];
  out.sort((a, b) => a.dist - b.dist);
  for (const o of out) { const k = o.name + '@' + o.lat.toFixed(4) + ',' + o.lng.toFixed(4); if (!seen.has(k)) { seen.add(k); dedup.push(o); } }
  return dedup;
}
const nearbyCache = new Map();
app.get('/api/nearby', async (req, res) => {
  const lat = parseFloat(req.query.lat), lng = parseFloat(req.query.lng);
  if (!isFinite(lat) || !isFinite(lng)) return res.status(400).json({ error: 'cần lat & lng' });
  const q = String(req.query.q || '').slice(0, 60);
  let limit = parseInt(req.query.limit, 10); if (!isFinite(limit) || limit < 1) limit = 10; limit = Math.min(limit, 30);
  let radius = parseInt(req.query.radius, 10); if (!isFinite(radius) || radius < 100) radius = 1500; radius = Math.min(radius, 5000);
  const cacheKey = lat.toFixed(3) + ',' + lng.toFixed(3) + '|' + q.toLowerCase() + '|' + radius;
  try {
    let list = nearbyCache.get(cacheKey);
    if (!list) {
      const tags = poiTagsFor(q);
      if (tags) list = await nearbyOverpass(lat, lng, tags, radius);
      else {
        // Unknown category → Nominatim search bounded to a viewbox around the user.
        const d = radius / 111000; // ~deg
        const vb = [lng - d, lat + d, lng + d, lat - d].join(',');
        const wait = Math.max(0, 1100 - (Date.now() - lastGeoCall)); if (wait) await new Promise((r) => setTimeout(r, wait)); lastGeoCall = Date.now();
        const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=' + limit + '&bounded=1&viewbox=' + vb + '&q=' + encodeURIComponent(q);
        const r2 = await fetch(url, { headers: { 'User-Agent': 'LAAM-chat/0.1 (self-host)', 'Accept-Language': 'vi,en' } });
        const arr = await r2.json();
        list = (Array.isArray(arr) ? arr : []).map((a) => ({ name: (a.display_name || '').split(',')[0], lat: parseFloat(a.lat), lng: parseFloat(a.lon), dist: haversine(lat, lng, parseFloat(a.lat), parseFloat(a.lon)), kind: a.type || null })).sort((x, y) => x.dist - y.dist);
      }
      nearbyCache.set(cacheKey, list);
    }
    res.json({ query: q, center: { lat, lng }, radius, results: list.slice(0, limit) });
  } catch (e) {
    res.status(502).json({ error: 'không tìm được địa điểm quanh đây' });
  }
});

// ---- OCR (read text from images / scanned PDF pages) via tesseract --------
// Accepts a base64 data URL, runs the system `tesseract` (vie+eng+chi_sim),
// returns the recognised text. The client renders scanned PDF pages to PNG and
// posts them here one by one. Fail-soft so a blurry scan never breaks the chat.
let _tessChecked = false, _tessOk = false;
function tesseractAvailable() {
  if (_tessChecked) return Promise.resolve(_tessOk);
  return new Promise((resolve) => {
    execFile('tesseract', ['--version'], { timeout: 5000 }, (err) => { _tessChecked = true; _tessOk = !err; resolve(_tessOk); });
  });
}
app.post('/api/ocr', async (req, res) => {
  const body = req.body || {};
  const dataUrl = typeof body.image === 'string' ? body.image : '';
  const m = dataUrl.match(/^data:image\/(png|jpe?g|webp|bmp|gif|tiff?);base64,(.+)$/i);
  if (!m) return res.status(400).json({ error: 'ảnh không hợp lệ' });
  if (!(await tesseractAvailable())) return res.status(503).json({ error: 'OCR chưa sẵn sàng: thiếu tesseract trên máy chủ' });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 12 * 1024 * 1024) return res.status(413).json({ error: 'ảnh quá lớn cho OCR' });
  const ext = m[1].toLowerCase().replace('jpeg', 'jpg').replace('tiff', 'tif');
  const tmp = path.join(os.tmpdir(), 'laam-ocr-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + ext);
  const lang = (typeof body.lang === 'string' && /^[a-z+_]+$/i.test(body.lang)) ? body.lang : 'vie+eng+chi_sim';
  try {
    await fs.promises.writeFile(tmp, buf);
    const text = await new Promise((resolve, reject) => {
      execFile('tesseract', [tmp, 'stdout', '-l', lang], { timeout: 45000, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
        if (err) reject(err); else resolve(stdout || '');
      });
    });
    res.json({ text: String(text) });
  } catch (e) {
    res.status(500).json({ error: 'OCR thất bại: ' + ((e && e.message) ? e.message : String(e)) });
  } finally {
    fs.promises.unlink(tmp).catch(() => {});
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

connectors.loadConnectors().then((ids) => {
  if (ids.length) console.log(`  ▶  Connectors loaded: ${ids.join(', ')}`);
}).catch(() => {});

app.listen(PORT, () => {
  console.log(`\n  LAAM — Local AI Agent Monitoring`);
  console.log(`  ▶  http://localhost:${PORT}`);
  console.log(`  ▶  Claude transcripts: ${PROJECTS_DIR}`);
  console.log(`  ▶  Local model logs:   ${LOCAL_LOGS_DIR}\n`);
});
