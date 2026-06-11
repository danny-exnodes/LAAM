#!/usr/bin/env node
// LAAM v2 — remote collector.
//
// Runs on each dev machine, scans this machine's Claude transcripts
// (~/.claude/projects) + local-model logs (~/.laam/local-logs) using the SAME
// parser as the server, and pushes parsed sessions to the central LAAM via
// POST /api/ingest, authenticated with a machine token.
//
// Zero dependencies (Node ≥ 18: built-in fetch + the vendored parsers).
//
// Usage:
//   LAAM_URL=https://laam.<tailnet>.ts.net \
//   LAAM_MACHINE_TOKEN=laam_xxx \
//   node collector/laam-collector.mjs
//
//   # keep pushing every 60s:
//   LAAM_INTERVAL_SEC=60 LAAM_URL=... LAAM_MACHINE_TOKEN=... node collector/laam-collector.mjs
import { pathToFileURL } from "node:url";
import { scanAll } from "../src/lib/monitoring/parser.js";
import { scanLocal } from "../src/lib/monitoring/localParser.js";
// Pure retry helpers live in retry.mjs (no shebang) so the test suite can import
// them; re-exported here so existing importers of this module keep working.
import { RETRY_BACKOFF_MS, sleep, pushWithRetry, makeCycle } from "./retry.mjs";
export { RETRY_BACKOFF_MS, pushWithRetry, makeCycle };

const LAAM_URL = (process.env.LAAM_URL || "http://localhost:3000").replace(/\/$/, "");
const TOKEN = process.env.LAAM_MACHINE_TOKEN;
const INTERVAL = Number(process.env.LAAM_INTERVAL_SEC || 0);

async function pushOnce() {
  const claude = scanAll();
  const local = scanLocal();
  const projects = [...claude.projects, ...local.projects].map((p) => ({
    path: p.path,
    name: p.name,
  }));
  // Strip the host file path — it isn't readable on the server.
  const sessions = [...claude.sessions, ...local.sessions].map(({ file, ...rest }) => rest);

  const res = await fetch(`${LAAM_URL}/api/ingest`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ projects, sessions }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Ingest lỗi ${res.status}: ${data.error || JSON.stringify(data)}`);
  }
  console.log(
    `[${new Date().toISOString()}] ✓ đẩy ${data.sessions} session / ${data.projects} project → "${data.machine}"`,
  );
}

// pushWithRetry + makeCycle: see ./retry.mjs (imported + re-exported above).

// Phần CLI chỉ chạy khi file được thực thi trực tiếp (node collector/laam-collector.mjs),
// để test import được các hàm ở trên mà không kích hoạt push / process.exit.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  if (!TOKEN) {
    console.error("✗ Thiếu LAAM_MACHINE_TOKEN (tạo ở trang /machines của LAAM).");
    process.exit(1);
  }

  const cycle = makeCycle(pushOnce);
  await cycle();
  if (INTERVAL > 0) {
    console.log(`↻ Theo dõi: đẩy lại mỗi ${INTERVAL}s (Ctrl+C để dừng)…`);
    // cycle() không throw, nhưng vẫn .catch() phòng hờ để vòng lặp không bao giờ chết.
    setInterval(
      () => cycle().catch((e) => console.error(`[${new Date().toISOString()}] ✗`, e)),
      INTERVAL * 1000,
    );
  }
}
