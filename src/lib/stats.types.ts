// LAAM v2 — types for the stats aggregation (Package B, Wave 0).
//
// `Stats` is the LOCKED shape from the Wave 0 plan ("Shared Interfaces"); every
// consumer (Dashboard / Agents in later waves) depends on it verbatim. The
// aggregation logic is ported from v1 `lib/stats.js`, but the *shape* is the
// locked contract — not v1's return value (see plan: Rule-7 conflict resolution).

/** Per-tool summary as stored in agent_sessions.tools (jsonb). */
export type ToolRow = {
  name: string;
  count: number;
  errors: number;
  avgDurationMs: number | null;
};

/**
 * One row as consumed by computeStats — the subset of the agent_sessions row
 * the aggregation needs, with time columns normalized to epoch-ms and a
 * resolved `project` label (the route joins project.name; the pure fn just
 * keys on whatever string it is handed).
 */
export type SessionRow = {
  id: string;
  status: string | null; // running | idle | done
  model: string | null;
  gitBranch: string | null;
  project: string | null;
  startedAt: number | null; // epoch ms
  lastActivity: number | null; // epoch ms
  messageCount: number;
  toolCount: number;
  subAgentCount: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  tools: ToolRow[] | null;
  histo: Record<string, number> | null; // "<dow>_<hour>" -> count
};

export interface Stats {
  totals: {
    sessions: number;
    running: number;
    idle: number;
    done: number;
    messages: number;
    toolCalls: number;
    subAgents: number;
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
    avgDurationMs: number;
  };
  byStatus: Record<string, number>;
  byModel: Record<string, number>;
  byBranch: Record<string, number>;
  byProject: {
    project: string;
    sessions: number;
    tokensIn: number;
    tokensOut: number;
    toolCalls: number;
  }[];
  toolLeaderboard: {
    name: string;
    count: number;
    errors: number;
    errorRate: number;
    avgDurationMs: number | null;
  }[];
  modelComparison: {
    model: string;
    sessions: number;
    tokens: number;
    costUsd: number;
    avgDurationMs: number;
    tokensPerMin: number;
    doneRate: number;
  }[];
  heatmap: number[][]; // [weekday 0-6][hour 0-23]
  activity: { t: number; sessions: number; tokens: number }[];
  topByDuration: { id: string; label: string; durationMs: number }[];
  topByTokens: { id: string; label: string; tokens: number }[];
}
