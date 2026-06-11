import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scanLocal, clearLocalScanCache } from "./localParser.js";
import { RUNNING_WINDOW_MS } from "./parser.js";

// Fixtures mirror the Ollama logging-proxy format: one JSON line per completed
// request — { model, ts, endTs, tokensIn/Out, request:{messages}, responseText }.

let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "laam-locallogs-"));
  clearLocalScanCache();
});
afterEach(() => {
  vi.restoreAllMocks();
  clearLocalScanCache();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const line = (ts: number, text: string) =>
  JSON.stringify({
    model: "qwen3-vl:8b",
    ts,
    endTs: ts + 500,
    tokensIn: 10,
    tokensOut: 5,
    request: { messages: [{ role: "user", content: "xin chào" }] },
    responseText: text,
  }) + "\n";

describe("scanLocal cache", () => {
  // scanLocal() runs on EVERY POST /api/sync alongside scanAll(); unchanged
  // log files must be served from the per-file cache, not re-read (perf M1).

  test("second scan serves unchanged files from cache without re-reading", () => {
    const ts = Date.now() - 1000;
    fs.writeFileSync(path.join(tmpDir, "conv-1.jsonl"), line(ts, "chào bạn"));

    const spy = vi.spyOn(fs, "readFileSync");
    const r1 = scanLocal(tmpDir);
    expect(r1.sessions).toHaveLength(1);
    const readsAfterFirst = spy.mock.calls.length;
    expect(readsAfterFirst).toBeGreaterThan(0);

    const r2 = scanLocal(tmpDir);
    // Same mtime + size → no fs read; the parsed session is still served.
    expect(spy.mock.calls.length).toBe(readsAfterFirst);
    expect(r2.sessions[0]).toMatchObject({
      id: "conv-1",
      source: "local",
      model: "qwen3-vl:8b",
      messageCount: 2, // 1 user turn + 1 assistant turn
      costUSD: 0,
    });
    expect(r2.projects).toHaveLength(1);
  });

  test("a changed file is re-parsed; a deleted file disappears", () => {
    const ts = Date.now() - 1000;
    const file1 = path.join(tmpDir, "conv-1.jsonl");
    const file2 = path.join(tmpDir, "conv-2.jsonl");
    fs.writeFileSync(file1, line(ts, "một"));
    fs.writeFileSync(file2, line(ts, "hai"));
    expect(scanLocal(tmpDir).sessions).toHaveLength(2);

    // The proxy appends a request → next scan must surface it (size change
    // guarantees a cache miss even on coarse-mtime filesystems).
    fs.appendFileSync(file1, line(ts + 2000, "ba"));
    fs.rmSync(file2);
    const r2 = scanLocal(tmpDir);
    expect(r2.sessions.map((s: { id: string }) => s.id)).toEqual(["conv-1"]);
    expect(r2.sessions[0].messageCount).toBe(4); // 2 requests now
  });

  test("cache hits still recompute status against now", () => {
    // Status is the only `now`-dependent field of a local session — if the
    // cache froze it, a finished Ollama session would show "running" forever.
    const base = Date.now();
    fs.writeFileSync(path.join(tmpDir, "conv-live.jsonl"), line(base, "đang chạy"));

    expect(scanLocal(tmpDir, base + 1000).sessions[0].status).toBe("running");

    const spy = vi.spyOn(fs, "readFileSync");
    const r2 = scanLocal(tmpDir, base + RUNNING_WINDOW_MS + 2000);
    expect(spy.mock.calls.length).toBe(0); // served from cache…
    expect(r2.sessions[0].status).toBe("idle"); // …but the status moved on
  });
});
