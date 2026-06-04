import { describe, expect, test } from "vitest";
import {
  applyFilters,
  EMPTY_FILTERS,
  AGENT_CSV_COLUMNS,
  toCsvRow,
  type AgentFilters,
} from "./filters";
import type { LiveSession } from "@/hooks/useLiveSessions";

const NOW = 1_700_000_000_000;

function mk(over: Partial<LiveSession> = {}): LiveSession {
  return {
    id: "s1",
    projectId: "p1",
    projectName: "LAAM",
    source: "claude",
    model: "claude-sonnet-4",
    gitBranch: "main",
    status: "running",
    startedAt: NOW - 60_000,
    lastActivity: NOW - 30_000,
    messageCount: 4,
    toolCount: 2,
    subAgentCount: 1,
    subAgents: [{ id: "a", type: "explorer", description: "scan", status: "done", durationMs: 1000 }],
    costUsd: 0.12,
    latestActivity: "Reading files",
    tokensIn: 100,
    tokensOut: 50,
    ...over,
  };
}

const f = (over: Partial<AgentFilters> = {}): AgentFilters => ({ ...EMPTY_FILTERS, ...over });

describe("applyFilters", () => {
  test("empty filters return all sessions", () => {
    const list = [mk(), mk({ id: "s2" })];
    expect(applyFilters(list, EMPTY_FILTERS, NOW)).toHaveLength(2);
  });

  test("q matches project name (case-insensitive)", () => {
    const list = [mk({ projectName: "LAAM" }), mk({ id: "s2", projectName: "Other" })];
    expect(applyFilters(list, f({ q: "laam" }), NOW).map((s) => s.id)).toEqual(["s1"]);
  });

  test("q matches model, latestActivity and sub-agent type", () => {
    const list = [
      mk({ id: "m", model: "qwen3-vl", projectName: "x", latestActivity: "", subAgents: null }),
      mk({ id: "l", model: "z", projectName: "x", latestActivity: "Editing README", subAgents: null }),
      mk({ id: "sub", model: "z", projectName: "x", latestActivity: "", subAgents: [{ id: "a", type: "reviewer", description: "", status: "done", durationMs: null }] }),
    ];
    expect(applyFilters(list, f({ q: "qwen" }), NOW).map((s) => s.id)).toEqual(["m"]);
    expect(applyFilters(list, f({ q: "readme" }), NOW).map((s) => s.id)).toEqual(["l"]);
    expect(applyFilters(list, f({ q: "reviewer" }), NOW).map((s) => s.id)).toEqual(["sub"]);
  });

  test("status filter exact; 'stuck' uses isStuck (>10m, not done)", () => {
    const list = [
      mk({ id: "run", status: "running", lastActivity: NOW - 1000 }),
      mk({ id: "old", status: "running", lastActivity: NOW - 20 * 60_000 }),
      mk({ id: "done", status: "done", lastActivity: NOW - 20 * 60_000 }),
    ];
    expect(applyFilters(list, f({ status: "running" }), NOW).map((s) => s.id)).toEqual(["run", "old"]);
    expect(applyFilters(list, f({ status: "stuck" }), NOW).map((s) => s.id)).toEqual(["old"]);
  });

  test("time window filters on lastActivity", () => {
    const list = [
      mk({ id: "fresh", lastActivity: NOW - 30 * 60_000 }),
      mk({ id: "old", lastActivity: NOW - 3 * 3_600_000 }),
    ];
    expect(applyFilters(list, f({ window: "1h" }), NOW).map((s) => s.id)).toEqual(["fresh"]);
    expect(applyFilters(list, f({ window: "6h" }), NOW).map((s) => s.id)).toEqual(["fresh", "old"]);
  });

  test("project / model / branch exact filters and combine (AND)", () => {
    const list = [
      mk({ id: "a", projectName: "LAAM", model: "m1", gitBranch: "main" }),
      mk({ id: "b", projectName: "LAAM", model: "m2", gitBranch: "dev" }),
    ];
    expect(applyFilters(list, f({ project: "LAAM", model: "m1" }), NOW).map((s) => s.id)).toEqual(["a"]);
    expect(applyFilters(list, f({ branch: "dev" }), NOW).map((s) => s.id)).toEqual(["b"]);
  });
});

describe("AGENT_CSV_COLUMNS + toCsvRow", () => {
  test("columns mirror v1 session export header", () => {
    expect(AGENT_CSV_COLUMNS).toEqual([
      "id", "project", "model", "gitBranch", "status",
      "startTime", "lastActivity", "durationMs", "messageCount",
      "toolUseCount", "subAgentCount", "tokensIn", "tokensOut", "costUSD",
    ]);
  });

  test("toCsvRow maps a LiveSession to keyed columns with ISO times + durationMs", () => {
    const row = toCsvRow(mk());
    expect(row.id).toBe("s1");
    expect(row.project).toBe("LAAM");
    expect(row.toolUseCount).toBe(2);
    expect(row.costUSD).toBe(0.12);
    expect(row.startTime).toBe(new Date(NOW - 60_000).toISOString());
    expect(row.lastActivity).toBe(new Date(NOW - 30_000).toISOString());
    expect(row.durationMs).toBe(30_000); // lastActivity - startedAt
  });

  test("toCsvRow leaves times empty when missing", () => {
    const row = toCsvRow(mk({ startedAt: null, lastActivity: null }));
    expect(row.startTime).toBe("");
    expect(row.lastActivity).toBe("");
    expect(row.durationMs).toBe("");
  });
});
