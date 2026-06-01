// LAAM — full-text search across transcript content (message text, tool
// inputs, tool results), not just session metadata.
import fs from 'node:fs';
import path from 'node:path';

function readLines(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return []; }
  const out = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t)); } catch { /* skip partial */ }
  }
  return out;
}

// Flatten one transcript entry into searchable text fragments.
function fragments(e) {
  const out = [];
  const msg = e.message;
  const side = e.isSidechain === true;
  if (!msg) return out;
  const push = (role, kind, text) => {
    if (text && String(text).trim()) out.push({ role, kind, text: String(text), sidechain: side });
  };
  const c = msg.content;
  if (typeof c === 'string') { push(e.type, 'text', c); return out; }
  if (!Array.isArray(c)) return out;
  for (const b of c) {
    if (!b || typeof b !== 'object') continue;
    if (b.type === 'text') push(e.type, 'text', b.text);
    else if (b.type === 'thinking') push(e.type, 'thinking', b.thinking);
    else if (b.type === 'tool_use') {
      const inp = b.input || {};
      const detail = inp.command || inp.file_path || inp.pattern || inp.prompt || inp.description || JSON.stringify(inp).slice(0, 400);
      push('assistant', 'tool', `${b.name || 'tool'} ${detail}`);
    } else if (b.type === 'tool_result') {
      const txt = typeof b.content === 'string'
        ? b.content
        : Array.isArray(b.content) ? b.content.map((x) => (x && x.text) || '').join(' ') : '';
      push('tool', 'result', txt);
    }
  }
  return out;
}

function snippet(text, q, span = 90) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i === -1) return text.slice(0, span * 2);
  const start = Math.max(0, i - span);
  const end = Math.min(text.length, i + q.length + span);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

// Search across all sessions returned by scanAll(). `q` is a plain substring
// (case-insensitive). Returns up to `limit` matches with session context.
export function searchTranscripts(scan, q, { limit = 200 } = {}) {
  const query = (q || '').trim();
  if (!query) return { query, total: 0, matches: [] };
  const lq = query.toLowerCase();
  const matches = [];
  let total = 0;

  for (const s of scan.sessions || []) {
    if (!s.file) continue;
    let entries;
    try { entries = readLines(s.file); } catch { continue; }
    for (const e of entries) {
      const ts = e.timestamp ? Date.parse(e.timestamp) : null;
      for (const f of fragments(e)) {
        if (!f.text.toLowerCase().includes(lq)) continue;
        total++;
        if (matches.length < limit) {
          matches.push({
            sessionId: s.id,
            project: s.project,
            projectPath: s.projectPath,
            model: s.model,
            role: f.role,
            kind: f.kind,
            sidechain: f.sidechain,
            ts: Number.isNaN(ts) ? null : ts,
            snippet: snippet(f.text, query),
          });
        }
      }
    }
  }
  matches.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return { query, total, matches, truncated: total > matches.length };
}
