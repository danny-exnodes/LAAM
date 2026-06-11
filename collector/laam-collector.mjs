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

const LAAM_URL = (process.env.LAAM_URL || "http://localhost:3000").replace(/\/$/, "");
const TOKEN = process.env.LAAM_MACHINE_TOKEN;
const INTERVAL = Number(process.env.LAAM_INTERVAL_SEC || 0);

/** Backoff trước lần retry duy nhất sau khi push fail. */
export const RETRY_BACKOFF_MS = 2000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

/**
 * Chạy `push` với tối đa 1 retry sau backoff. KHÔNG bao giờ throw — trả về
 * true (thành công) / false (cả hai lần đều fail) để vòng setInterval không
 * chết vì một lần mạng/server lỗi. `sleep`/`log` inject được cho test.
 */
export async function pushWithRetry(push, { backoffMs = RETRY_BACKOFF_MS, sleep: wait = sleep, log = console.error } = {}) {
  try {
    await push();
    return true;
  } catch (err) {
    log(`[${new Date().toISOString()}] ✗ Push lỗi (${err?.message ?? err}) — retry sau ${backoffMs / 1000}s…`);
    await wait(backoffMs);
  }
  try {
    await push();
    return true;
  } catch (err) {
    log(`[${new Date().toISOString()}] ✗ Retry vẫn lỗi: ${err?.message ?? err}`);
    return false;
  }
}

/**
 * Tạo 1 chu kỳ push có đếm thất bại liên tiếp: fail (cả retry) → tăng
 * consecutiveFailures + log; thành công → reset về 0. Trả về số đếm hiện tại
 * (0 = chu kỳ này thành công). Không throw.
 */
export function makeCycle(push, { log = console.error, ...retryOpts } = {}) {
  let consecutiveFailures = 0;
  return async function cycle() {
    const ok = await pushWithRetry(push, { log, ...retryOpts });
    if (ok) {
      consecutiveFailures = 0;
    } else {
      consecutiveFailures += 1;
      log(
        `[${new Date().toISOString()}] ✗ Push thất bại (consecutiveFailures=${consecutiveFailures}) — chờ chu kỳ sau.`,
      );
    }
    return consecutiveFailures;
  };
}

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
