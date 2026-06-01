// LAAM — end-to-end-ish test for the parser + stats aggregation.
// Builds a synthetic ~/.claude/projects tree, scans it, and asserts the
// computed statistics. Also smoke-tests scanAll against the real projects dir.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanAll } from '../lib/parser.js';
import { computeStats } from '../lib/stats.js';
import { defaultProjectsDir } from '../lib/parser.js';

let failures = 0;
function ok(cond, msg) {
  if (cond) { console.log(`  ✓ ${msg}`); }
  else { console.error(`  ✗ ${msg}`); failures++; }
}
function eq(a, b, msg) { ok(a === b, `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }

// ---- Build a mock projects dir -----------------------------------------
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'laam-test-'));
const T0 = 1_700_000_000_000; // fixed past timestamp → everything "done"
const iso = (ms) => new Date(ms).toISOString();

function writeSession(dir, file, entries) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
}

const projA = path.join(root, '-Users-test-projA');
const projB = path.join(root, '-Users-test-projB');

// Project A / session 1: opus, 1 tool_use + 1 completed sub-agent.
writeSession(projA, 'aaaa1111.jsonl', [
  { type: 'user', timestamp: iso(T0), cwd: '/Users/test/projA', gitBranch: 'main', message: { content: 'hello' } },
  { type: 'assistant', timestamp: iso(T0 + 1000), cwd: '/Users/test/projA', gitBranch: 'main', version: '1.0', message: { model: 'claude-opus-4-8', usage: { input_tokens: 100, output_tokens: 50 }, content: [
    { type: 'text', text: 'working' },
    { type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'ls' } },
    { type: 'tool_use', id: 'task1', name: 'Task', input: { subagent_type: 'Explore', description: 'search code', prompt: 'find X' } },
  ] } },
  { type: 'user', timestamp: iso(T0 + 5000), cwd: '/Users/test/projA', gitBranch: 'main', message: { content: [{ type: 'tool_result', tool_use_id: 'task1', content: 'found' }] } },
  { type: 'assistant', timestamp: iso(T0 + 6000), cwd: '/Users/test/projA', gitBranch: 'main', message: { model: 'claude-opus-4-8', usage: { input_tokens: 200, output_tokens: 80 }, content: [{ type: 'text', text: 'done' }] } },
]);

// Project A / session 2: sonnet, no sub-agents.
writeSession(projA, 'aaaa2222.jsonl', [
  { type: 'user', timestamp: iso(T0 + 10000), cwd: '/Users/test/projA', gitBranch: 'main', message: { content: 'hi' } },
  { type: 'assistant', timestamp: iso(T0 + 11000), cwd: '/Users/test/projA', gitBranch: 'main', message: { model: 'claude-sonnet-4-6', usage: { input_tokens: 30, output_tokens: 20 }, content: [{ type: 'text', text: 'ok' }, { type: 'tool_use', id: 'b2', name: 'Read', input: { file_path: '/x' } }] } },
]);

// Project B / session 3: opus, 2 sub-agents (one open → running sub).
writeSession(projB, 'bbbb3333.jsonl', [
  { type: 'user', timestamp: iso(T0 + 20000), cwd: '/Users/test/projB', gitBranch: 'feature/x', message: { content: 'orchestrate' } },
  { type: 'assistant', timestamp: iso(T0 + 21000), cwd: '/Users/test/projB', gitBranch: 'feature/x', message: { model: 'claude-opus-4-8', usage: { input_tokens: 500, output_tokens: 300 }, content: [
    { type: 'tool_use', id: 'task2', name: 'Task', input: { subagent_type: 'general-purpose', description: 'build', prompt: 'p' } },
    { type: 'tool_use', id: 'task3', name: 'Task', input: { subagent_type: 'code-reviewer', description: 'review', prompt: 'p' } },
  ] } },
  { type: 'user', timestamp: iso(T0 + 25000), cwd: '/Users/test/projB', gitBranch: 'feature/x', message: { content: [{ type: 'tool_result', tool_use_id: 'task2', content: 'built' }] } },
]);

// ---- Scan + compute -----------------------------------------------------
console.log('\n[1] Mock data — scanAll + computeStats');
const scan = scanAll(root, T0 + 30000);
const stats = computeStats(scan);

eq(stats.totals.sessions, 3, 'tổng 3 session');
eq(stats.totals.projects, 2, 'tổng 2 project');
eq(stats.totals.tokensIn, 100 + 200 + 30 + 500, 'tokens input cộng đúng');
eq(stats.totals.tokensOut, 50 + 80 + 20 + 300, 'tokens output cộng đúng');
eq(stats.totals.tokensTotal, 1280, 'tokens tổng = 1280');
eq(stats.totals.subAgents, 3, '3 sub-agent tổng');
eq(stats.totals.messages, 4 + 2 + 3, 'tổng message đúng');

const opus = stats.byModel.find((m) => m.model === 'claude-opus-4-8');
const sonnet = stats.byModel.find((m) => m.model === 'claude-sonnet-4-6');
eq(opus?.count, 2, 'opus xuất hiện 2 session');
eq(sonnet?.count, 1, 'sonnet xuất hiện 1 session');

const branches = stats.byBranch.map((b) => b.branch).sort();
ok(branches.includes('main') && branches.includes('feature/x'), 'có cả branch main và feature/x');

eq(stats.byProject.length, 2, 'byProject có 2 mục');
const top = stats.topByTokens[0];
eq(top.tokensTotal, 800, 'session nhiều token nhất = 800 (project B)');
ok(stats.activity.points.length >= 1, 'activity timeline có điểm dữ liệu');

const toolTotal = stats.byProject.reduce((n, p) => n + p.toolCalls, 0);
eq(toolTotal, 5, 'tổng tool call = 5 (Bash+Task, Read, Task+Task)');

// ---- Real dir smoke test ------------------------------------------------
console.log('\n[2] Real projects dir — smoke test (no crash)');
try {
  const realScan = scanAll(defaultProjectsDir());
  const realStats = computeStats(realScan);
  ok(typeof realStats.totals.sessions === 'number', `quét dữ liệu thật ok (${realStats.totals.sessions} session, ${realStats.totals.projects} project)`);
  ok(Array.isArray(realStats.activity.points), 'activity timeline dữ liệu thật là mảng');
} catch (e) {
  ok(false, `quét dữ liệu thật không lỗi: ${e.message}`);
}

// ---- Cleanup ------------------------------------------------------------
fs.rmSync(root, { recursive: true, force: true });

console.log(`\n${failures ? '❌' : '✅'} ${failures} lỗi\n`);
process.exit(failures ? 1 : 0);
