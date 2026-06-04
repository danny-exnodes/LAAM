import { describe, expect, test } from "vitest";
import { computeStats } from "./stats";
import type { SessionRow } from "./stats.types";

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

// A fixed base time so heatmap/activity buckets are deterministic.
const T0 = Date.UTC(2026, 5, 1, 0, 0, 0); // 2026-06-01T00:00Z

function row(partial: Partial<SessionRow>): SessionRow {
  return {
    id: "s",
    status: "done",
    model: "claude",
    gitBranch: "main",
    project: "alpha",
    startedAt: T0,
    lastActivity: T0 + HOUR,
    messageCount: 0,
    toolCount: 0,
    subAgentCount: 0,
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    tools: null,
    histo: null,
    ...partial,
  };
}

describe("computeStats — totals", () => {
  const sessions: SessionRow[] = [
    row({ id: "a", status: "running", model: "claude", tokensIn: 100, tokensOut: 50, costUsd: 1.5, messageCount: 4, toolCount: 3, subAgentCount: 1, startedAt: T0, lastActivity: T0 + 2 * HOUR }),
    row({ id: "b", status: "idle", model: "gemma4", tokensIn: 10, tokensOut: 5, costUsd: 0, messageCount: 2, toolCount: 1, subAgentCount: 0, startedAt: T0, lastActivity: T0 + HOUR }),
    row({ id: "c", status: "done", model: "claude", tokensIn: 1, tokensOut: 2, costUsd: 0.25, messageCount: 1, toolCount: 0, subAgentCount: 0, startedAt: null, lastActivity: null }),
  ];
  const stats = computeStats(sessions);

  test("counts and sums", () => {
    expect(stats.totals.sessions).toBe(3);
    expect(stats.totals.running).toBe(1);
    expect(stats.totals.idle).toBe(1);
    expect(stats.totals.done).toBe(1);
    expect(stats.totals.messages).toBe(7);
    expect(stats.totals.toolCalls).toBe(4);
    expect(stats.totals.subAgents).toBe(1);
    expect(stats.totals.tokensIn).toBe(111);
    expect(stats.totals.tokensOut).toBe(57);
    expect(stats.totals.costUsd).toBeCloseTo(1.75, 6);
  });

  test("avgDurationMs averages over ALL sessions, ignoring null/≤0 durations", () => {
    // durations: a=2h, b=1h, c=null → total 3h over 3 sessions
    expect(stats.totals.avgDurationMs).toBe(Math.round((2 * HOUR + HOUR) / 3));
  });

  test("byStatus / byModel / byBranch are records keyed by exact strings", () => {
    expect(stats.byStatus).toEqual({ running: 1, idle: 1, done: 1 });
    expect(stats.byModel).toEqual({ claude: 2, gemma4: 1 });
    expect(stats.byBranch).toEqual({ main: 3 });
  });

  test("null model / branch fall back to readable keys", () => {
    const s = computeStats([row({ model: null, gitBranch: null })]);
    expect(s.byModel).toEqual({ unknown: 1 });
    expect(s.byBranch).toEqual({ "(no branch)": 1 });
  });
});

describe("computeStats — byProject", () => {
  const sessions: SessionRow[] = [
    row({ id: "a", project: "alpha", tokensIn: 10, tokensOut: 1, toolCount: 2 }),
    row({ id: "b", project: "alpha", tokensIn: 5, tokensOut: 2, toolCount: 3 }),
    row({ id: "c", project: "beta", tokensIn: 100, tokensOut: 0, toolCount: 0 }),
  ];
  const stats = computeStats(sessions);

  test("aggregates per project and sorts by session count desc", () => {
    expect(stats.byProject).toEqual([
      { project: "alpha", sessions: 2, tokensIn: 15, tokensOut: 3, toolCalls: 5 },
      { project: "beta", sessions: 1, tokensIn: 100, tokensOut: 0, toolCalls: 0 },
    ]);
  });

  test("null project keyed as (no project)", () => {
    const s = computeStats([row({ project: null })]);
    expect(s.byProject[0].project).toBe("(no project)");
  });
});

describe("computeStats — toolLeaderboard", () => {
  const sessions: SessionRow[] = [
    row({
      id: "a",
      tools: [
        { name: "Bash", count: 10, errors: 2, avgDurationMs: 100 },
        { name: "Read", count: 5, errors: 0, avgDurationMs: 20 },
      ],
    }),
    row({
      id: "b",
      tools: [{ name: "Bash", count: 6, errors: 1, avgDurationMs: 200 }],
    }),
  ];
  const stats = computeStats(sessions);

  test("merges counts/errors and computes errorRate, sorted by count desc", () => {
    const bash = stats.toolLeaderboard.find((t) => t.name === "Bash")!;
    expect(bash.count).toBe(16);
    expect(bash.errors).toBe(3);
    expect(bash.errorRate).toBeCloseTo(3 / 16, 6);
    expect(stats.toolLeaderboard[0].name).toBe("Bash"); // highest count first
  });

  test("avgDurationMs is a count-weighted average across sessions", () => {
    // Bash: (100*10 + 200*6) / (10+6) = 2200/16 = 137.5 → round 138
    const bash = stats.toolLeaderboard.find((t) => t.name === "Bash")!;
    expect(bash.avgDurationMs).toBe(138);
  });

  // AGENTS.md Rule 13 — the model could echo a tool name with altered casing.
  // The leaderboard MUST key by the EXACT stored string, never case-folded.
  test("Rule 13: tool names with altered casing stay distinct (no normalization)", () => {
    const s = computeStats([
      row({ id: "x", tools: [{ name: "Bash", count: 3, errors: 0, avgDurationMs: null }] }),
      row({ id: "y", tools: [{ name: "bash", count: 7, errors: 0, avgDurationMs: null }] }),
    ]);
    const names = s.toolLeaderboard.map((t) => t.name).sort();
    expect(names).toEqual(["Bash", "bash"]);
    expect(s.toolLeaderboard.find((t) => t.name === "Bash")!.count).toBe(3);
    expect(s.toolLeaderboard.find((t) => t.name === "bash")!.count).toBe(7);
  });
});

describe("computeStats — modelComparison", () => {
  const sessions: SessionRow[] = [
    row({ id: "a", model: "claude", status: "done", tokensIn: 600, tokensOut: 0, costUsd: 2, startedAt: T0, lastActivity: T0 + HOUR }),
    row({ id: "b", model: "claude", status: "running", tokensIn: 0, tokensOut: 600, costUsd: 1, startedAt: T0, lastActivity: T0 + HOUR }),
  ];
  const stats = computeStats(sessions);

  test("aggregates sessions/tokens/cost and derives tokensPerMin + doneRate", () => {
    const claude = stats.modelComparison.find((m) => m.model === "claude")!;
    expect(claude.sessions).toBe(2);
    expect(claude.tokens).toBe(1200);
    expect(claude.costUsd).toBeCloseTo(3, 6);
    // total duration 2h = 120 min → 1200/120 = 10 tokens/min
    expect(claude.tokensPerMin).toBe(10);
    expect(claude.doneRate).toBeCloseTo(0.5, 6);
  });

  test("sorted by tokens desc", () => {
    const s = computeStats([
      row({ id: "a", model: "low", tokensIn: 1, tokensOut: 0 }),
      row({ id: "b", model: "high", tokensIn: 1000, tokensOut: 0 }),
    ]);
    expect(s.modelComparison[0].model).toBe("high");
  });
});

describe("computeStats — heatmap", () => {
  test("is 7×24 and accumulates histo buckets", () => {
    const stats = computeStats([
      row({ histo: { "0_9": 3, "6_23": 1 } }),
      row({ histo: { "0_9": 2 } }),
    ]);
    expect(stats.heatmap.length).toBe(7);
    expect(stats.heatmap[0].length).toBe(24);
    expect(stats.heatmap[0][9]).toBe(5);
    expect(stats.heatmap[6][23]).toBe(1);
    expect(stats.heatmap[3][3]).toBe(0);
  });

  test("out-of-range histo keys are ignored", () => {
    const stats = computeStats([row({ histo: { "9_9": 5, "0_99": 5 } })]);
    expect(stats.heatmap.flat().reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe("computeStats — activity", () => {
  test("hourly buckets for short spans, sessions+tokens summed per bucket", () => {
    const stats = computeStats([
      row({ id: "a", startedAt: T0, tokensIn: 10, tokensOut: 0 }),
      row({ id: "b", startedAt: T0 + 30 * 60 * 1000, tokensIn: 5, tokensOut: 0 }), // same hour
      row({ id: "c", startedAt: T0 + HOUR, tokensIn: 1, tokensOut: 0 }), // next hour
    ]);
    expect(stats.activity.length).toBe(2);
    expect(stats.activity[0]).toEqual({ t: T0, sessions: 2, tokens: 15 });
    expect(stats.activity[1]).toEqual({ t: T0 + HOUR, sessions: 1, tokens: 1 });
  });

  test("daily buckets when span exceeds 2 days", () => {
    const stats = computeStats([
      row({ id: "a", startedAt: T0 }),
      row({ id: "b", startedAt: T0 + 3 * DAY }),
    ]);
    // 4 daily buckets (gaps filled), endpoints present
    expect(stats.activity.length).toBe(4);
    expect(stats.activity[0].t).toBe(T0);
    expect(stats.activity[3].t).toBe(T0 + 3 * DAY);
  });

  test("empty when no start times", () => {
    expect(computeStats([row({ startedAt: null })]).activity).toEqual([]);
  });
});

describe("computeStats — topBy*", () => {
  const sessions: SessionRow[] = [
    row({ id: "slow", project: "p", model: "m", startedAt: T0, lastActivity: T0 + 5 * HOUR, tokensIn: 1, tokensOut: 0 }),
    row({ id: "fat", project: "q", model: "n", startedAt: T0, lastActivity: T0 + HOUR, tokensIn: 9000, tokensOut: 1000 }),
  ];
  const stats = computeStats(sessions);

  test("topByDuration ordered by duration desc with derived label", () => {
    expect(stats.topByDuration[0].id).toBe("slow");
    expect(stats.topByDuration[0].durationMs).toBe(5 * HOUR);
    expect(stats.topByDuration[0].label).toBe("p · m");
  });

  test("topByTokens ordered by total tokens desc", () => {
    expect(stats.topByTokens[0].id).toBe("fat");
    expect(stats.topByTokens[0].tokens).toBe(10000);
  });
});

describe("computeStats — empty input", () => {
  test("returns zeroed totals and empty collections", () => {
    const s = computeStats([]);
    expect(s.totals.sessions).toBe(0);
    expect(s.totals.avgDurationMs).toBe(0);
    expect(s.byProject).toEqual([]);
    expect(s.toolLeaderboard).toEqual([]);
    expect(s.activity).toEqual([]);
    expect(s.heatmap.length).toBe(7);
  });
});
