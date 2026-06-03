// Monitoring sync + shared upsert.
// - upsertSessions(): shared by the LOCAL host sync and the remote /api/ingest.
// - syncLocalMonitoring(): scans this host's transcripts/logs (reused v0.9 parsers)
//   and upserts under the auto-created "local:<hostname>" machine.
// Node-only (parsers use fs) → import from server code only.
import os from "node:os";
import { db } from "@/db";
import {
  machines,
  projects,
  agentSessions,
  type SubAgentJson,
  type ToolJson,
} from "@/db/schema";
import { scanAll } from "@/lib/monitoring/parser.js";
import { scanLocal } from "@/lib/monitoring/localParser.js";

export type ParsedProject = { path: string; name: string };
export type ParsedSession = {
  id: string;
  file?: string | null; // host path — only meaningful for the local machine
  source: string;
  projectPath: string;
  model: string;
  gitBranch: string | null;
  status: string;
  startTime: number | null;
  lastActivity: number | null;
  messageCount: number;
  toolUseCount: number;
  subAgentCount: number;
  costUSD: number;
  currentTask: { kind: string; text: string } | null;
  subAgents: SubAgentJson[];
  tools: ToolJson[];
  histo: Record<string, number>;
  tokens: { input: number; output: number };
};

/** Upsert parsed projects + sessions under a given machine. Shared code path. */
export async function upsertSessions(
  machineId: string,
  projectList: ParsedProject[],
  sessionList: ParsedSession[],
) {
  const now = new Date();

  const projectIdByPath = new Map<string, string>();
  for (const p of projectList) {
    if (projectIdByPath.has(p.path)) continue;
    const id = `proj:${p.path}`;
    await db
      .insert(projects)
      .values({ id, encodedCwd: p.path, name: p.name, cwd: p.path })
      .onConflictDoUpdate({
        target: projects.id,
        set: { name: p.name, cwd: p.path },
      });
    projectIdByPath.set(p.path, id);
  }

  for (const s of sessionList) {
    const row = {
      id: s.id,
      machineId,
      projectId: projectIdByPath.get(s.projectPath) ?? null,
      source: s.source ?? "claude",
      model: s.model ?? null,
      gitBranch: s.gitBranch ?? null,
      status: s.status ?? null,
      startedAt: s.startTime ? new Date(s.startTime) : null,
      lastActivity: s.lastActivity ? new Date(s.lastActivity) : null,
      messageCount: s.messageCount ?? 0,
      toolCount: s.toolUseCount ?? 0,
      subAgentCount: s.subAgentCount ?? 0,
      costUsd: s.costUSD ?? 0,
      latestActivity: s.currentTask?.text ?? null,
      tokensIn: s.tokens?.input ?? 0,
      tokensOut: s.tokens?.output ?? 0,
      subAgents: s.subAgents ?? [],
      tools: s.tools ?? [],
      histo: s.histo ?? {},
      transcriptPath: s.file ?? null,
      updatedAt: now,
    };
    await db
      .insert(agentSessions)
      .values(row)
      .onConflictDoUpdate({ target: agentSessions.id, set: { ...row } });
  }

  return { projects: projectList.length, sessions: sessionList.length };
}

/** Scan THIS host (Claude transcripts + local-model logs) and upsert. */
export async function syncLocalMonitoring() {
  const hostname = os.hostname();
  const machineId = `local:${hostname}`;
  const now = new Date();

  await db
    .insert(machines)
    .values({ id: machineId, name: hostname, hostname })
    .onConflictDoUpdate({
      target: machines.id,
      set: { name: hostname, hostname, lastSeen: now },
    });

  const claude = scanAll() as unknown as {
    projects: ParsedProject[];
    sessions: ParsedSession[];
    error?: string;
  };
  const local = scanLocal() as unknown as {
    projects: ParsedProject[];
    sessions: ParsedSession[];
  };

  const res = await upsertSessions(
    machineId,
    [...claude.projects, ...local.projects],
    [...claude.sessions, ...local.sessions],
  );

  return { ok: true as const, ...res, claudeError: claude.error ?? null };
}
