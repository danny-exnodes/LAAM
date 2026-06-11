import { describe, test, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  parseSession,
  scanAll,
  RUNNING_WINDOW_MS,
  IDLE_WINDOW_MS,
} from "./parser.js";

// Fixtures mirror real Claude Code transcript entries: one JSON object per line,
// top-level { type, timestamp, cwd, gitBranch, message }, assistant content as
// block arrays (text / tool_use), tool results as user-side tool_result blocks.

let tmpRoot: string;
beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "laam-parser-"));
});
afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const jl = (entries: unknown[]) =>
  entries.map((e) => JSON.stringify(e)).join("\n") + "\n";

function writeFixture(name: string, content: string): string {
  const file = path.join(tmpRoot, name);
  fs.writeFileSync(file, content);
  return file;
}

const T0 = "2026-06-01T10:00:00.000Z";
const T1 = "2026-06-01T10:00:05.000Z";
const T2 = "2026-06-01T10:00:09.000Z";

const userEntry = {
  type: "user",
  timestamp: T0,
  cwd: "/Users/dev/demoproj",
  gitBranch: "main",
  message: { content: "fix the login bug" },
};
const assistantEntry = {
  type: "assistant",
  timestamp: T1,
  message: {
    model: "claude-sonnet-4-5",
    usage: { input_tokens: 120, output_tokens: 45 },
    content: [
      { type: "text", text: "Looking at it." },
      { type: "tool_use", id: "tu_1", name: "Bash", input: { command: "npm test" } },
    ],
  },
};
const toolResultEntry = {
  type: "user",
  timestamp: T2,
  message: {
    content: [{ type: "tool_result", tool_use_id: "tu_1", content: "ok" }],
  },
};

describe("parseSession", () => {
  test("tolerates malformed JSONL lines — files are read mid-write", () => {
    // Claude is still appending when we parse; a torn tail line must be skipped,
    // not crash the whole monitoring sync.
    const file = writeFixture(
      "sess-torn.jsonl",
      JSON.stringify(userEntry) +
        "\n" +
        '{"type":"assistant","message":{"content":[{"ty' + // torn mid-write
        "\n" +
        "this is not json at all\n" +
        "\n" + // blank line
        JSON.stringify(assistantEntry) +
        "\n",
    );
    expect(() => parseSession(file)).not.toThrow();
    const s = parseSession(file);
    // The two valid lines still count — partial corruption loses one entry, not the session.
    expect(s.messageCount).toBe(2);
    expect(s.model).toBe("claude-sonnet-4-5");
  });

  test("summarizes a transcript: counts, tokens, tools, current task", () => {
    const file = writeFixture("sess-abc.jsonl", jl([userEntry, assistantEntry, toolResultEntry]));
    const s = parseSession(file);

    expect(s.id).toBe("sess-abc"); // sessionId comes from the filename, not file content
    expect(s.project).toBe("demoproj");
    expect(s.projectPath).toBe("/Users/dev/demoproj");
    expect(s.model).toBe("claude-sonnet-4-5");
    expect(s.gitBranch).toBe("main");
    // tool_result entries arrive as type:"user" and must count as messages the
    // same way the dashboard's per-session totals do.
    expect(s.messageCount).toBe(3);
    expect(s.userMessageCount).toBe(2);
    expect(s.assistantMessageCount).toBe(1);
    expect(s.tokens).toEqual({ input: 120, output: 45 });
    expect(s.toolUseCount).toBe(1);
    // Tool timing pairs tool_use (T1) with its tool_result (T2) by id.
    expect(s.tools).toEqual([
      expect.objectContaining({ name: "Bash", count: 1, errors: 0, avgDurationMs: 4000 }),
    ]);
    expect(s.startTime).toBe(Date.parse(T0));
    expect(s.lastActivity).toBe(Date.parse(T2));
    expect(s.durationMs).toBe(9000);
    // "Currently working on": the latest meaningful main-chain block is the tool call.
    expect(s.currentTask).toEqual({ kind: "tool", text: "Bash — npm test", tool: "Bash" });
  });

  test("Task call without a tool_result is a running sub-agent; closed one is done", () => {
    // The dashboard's "running sub-agents" badge hinges on unclosed Task calls
    // being reported as running.
    const tA = "2026-06-01T10:00:00.000Z";
    const tB = "2026-06-01T10:00:10.000Z";
    const file = writeFixture(
      "sess-subs.jsonl",
      jl([
        {
          type: "assistant",
          timestamp: tA,
          message: {
            content: [
              {
                type: "tool_use",
                id: "task_done",
                name: "Task",
                input: { subagent_type: "reviewer", description: "review PR" },
              },
              {
                type: "tool_use",
                id: "task_open",
                name: "Task",
                input: { subagent_type: "builder", description: "build feature" },
              },
            ],
          },
        },
        {
          type: "user",
          timestamp: tB,
          message: { content: [{ type: "tool_result", tool_use_id: "task_done", content: "done" }] },
        },
      ]),
    );
    const now = Date.parse(tA) + 60_000;
    const s = parseSession(file, now);

    expect(s.subAgentCount).toBe(2);
    const done = s.subAgents.find((x: { id: string }) => x.id === "task_done");
    const open = s.subAgents.find((x: { id: string }) => x.id === "task_open");
    expect(done).toMatchObject({ status: "done", endTime: Date.parse(tB), durationMs: 10_000 });
    // Running sub-agent: no end yet, duration keeps growing against `now`.
    expect(open).toMatchObject({ status: "running", endTime: null, durationMs: 60_000 });
  });

  test("status follows recency windows: running → idle → done", () => {
    // These thresholds drive the status pills (green/amber/gray) on /agents.
    const base = Date.now();
    const file = writeFixture(
      "sess-status.jsonl",
      jl([
        {
          type: "user",
          timestamp: new Date(base).toISOString(),
          cwd: "/Users/dev/demoproj",
          message: { content: "hello" },
        },
      ]),
    );
    expect(parseSession(file, base + RUNNING_WINDOW_MS - 1000).status).toBe("running");
    expect(parseSession(file, base + RUNNING_WINDOW_MS + 1000).status).toBe("idle");
    expect(parseSession(file, base + IDLE_WINDOW_MS + 1000).status).toBe("done");
  });
});

describe("scanAll", () => {
  test("skips empty sessions and groups the rest by project", () => {
    // An opened-but-never-used transcript must not show up as a ghost agent.
    const projectsDir = path.join(tmpRoot, "projects");
    const projDir = path.join(projectsDir, "-Users-dev-demoproj");
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, "sess-1.jsonl"), jl([userEntry, assistantEntry]));
    fs.writeFileSync(path.join(projDir, "empty.jsonl"), "\n\n"); // no entries → filtered
    fs.writeFileSync(path.join(projDir, "notes.txt"), "not a transcript"); // non-.jsonl → ignored

    const r = scanAll(projectsDir);
    expect("error" in r).toBe(false);
    expect(r.sessions).toHaveLength(1);
    expect(r.sessions[0].id).toBe("sess-1");
    expect(r.projects).toHaveLength(1);
    expect(r.projects[0]).toMatchObject({
      path: "/Users/dev/demoproj",
      name: "demoproj",
      sessionCount: 1,
    });
  });

  test("missing projects dir reports an error payload instead of throwing", () => {
    // A fresh machine without ~/.claude/projects is a normal state — the
    // monitoring API must answer with an empty result, not a 500.
    const r = scanAll(path.join(tmpRoot, "does-not-exist"));
    expect("error" in r && r.error).toBeTruthy();
    expect(r.sessions).toEqual([]);
    expect(r.projects).toEqual([]);
  });
});
