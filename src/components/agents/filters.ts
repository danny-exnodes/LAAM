// Pure filter + CSV-row mapping for the Agents list. No DOM, no React — unit-tested.
// Mirrors the filter semantics of v1 public/agents.js and the session CSV header
// of v1 public/export.js.

import { isStuck } from "@/lib/stuck";
import type { LiveSession } from "@/hooks/useLiveSessions";

export type AgentFilters = {
  q: string;
  project: string;
  model: string;
  status: string;
  branch: string;
  window: string;
  machine: string; // machine id (from /api/machines), "" = all machines
};

export const EMPTY_FILTERS: AgentFilters = {
  q: "",
  project: "",
  model: "",
  status: "",
  branch: "",
  window: "",
  machine: "",
};

// Fallback stuck threshold (minutes) when a caller doesn't pass one. The live value
// comes from /api/config (LAAM_STUCK_MIN) via useLiveSessions → applyFilters(stuckMin).
const DEFAULT_STUCK_MIN = 10;

// Time-window option → milliseconds back from `now`.
const WINDOW_MS: Record<string, number> = {
  "1h": 3_600_000,
  "6h": 6 * 3_600_000,
  "24h": 24 * 3_600_000,
  "7d": 7 * 86_400_000,
};

// Build the searchable text for a session: project, model, latest activity,
// branch, and every sub-agent type. Lower-cased once.
function haystack(s: LiveSession): string {
  const parts: (string | null)[] = [s.projectName, s.model, s.latestActivity, s.gitBranch];
  for (const a of s.subAgents ?? []) parts.push(a.type);
  return parts.filter(Boolean).join(" ").toLowerCase();
}

export function applyFilters(
  sessions: LiveSession[],
  f: AgentFilters,
  now: number = Date.now(),
  stuckMin: number = DEFAULT_STUCK_MIN,
): LiveSession[] {
  const q = f.q.trim().toLowerCase();
  const winMs = f.window ? WINDOW_MS[f.window] : undefined;
  return sessions.filter((s) => {
    if (q && !haystack(s).includes(q)) return false;
    if (f.project && s.projectName !== f.project) return false;
    if (f.model && s.model !== f.model) return false;
    if (f.branch && s.gitBranch !== f.branch) return false;
    if (f.machine && s.machineId !== f.machine) return false;
    if (f.status) {
      if (f.status === "stuck") {
        if (!isStuck(s, stuckMin, now)) return false;
      } else if (s.status !== f.status) {
        return false;
      }
    }
    if (winMs != null) {
      if (s.lastActivity == null || now - s.lastActivity > winMs) return false;
    }
    return true;
  });
}

// CSV header mirrors v1 export.js session columns, restricted to fields present
// on LiveSession. (v1 projectPath / user|assistantMessageCount are not carried
// by the live snapshot, so they are intentionally omitted rather than blank.)
export const AGENT_CSV_COLUMNS = [
  "id", "project", "model", "gitBranch", "status",
  "startTime", "lastActivity", "durationMs", "messageCount",
  "toolUseCount", "subAgentCount", "tokensIn", "tokensOut", "costUSD",
] as const;

function isoOrEmpty(ms: number | null): string {
  return ms == null ? "" : new Date(ms).toISOString();
}

// Map a LiveSession to a flat record keyed by AGENT_CSV_COLUMNS, ready for downloadCsv.
export function toCsvRow(s: LiveSession): Record<string, unknown> {
  const durationMs =
    s.startedAt != null && s.lastActivity != null ? s.lastActivity - s.startedAt : "";
  return {
    id: s.id,
    project: s.projectName ?? "",
    model: s.model ?? "",
    gitBranch: s.gitBranch ?? "",
    status: s.status,
    startTime: isoOrEmpty(s.startedAt),
    lastActivity: isoOrEmpty(s.lastActivity),
    durationMs,
    messageCount: s.messageCount,
    toolUseCount: s.toolCount,
    subAgentCount: s.subAgentCount,
    tokensIn: s.tokensIn,
    tokensOut: s.tokensOut,
    costUSD: s.costUsd,
  };
}
