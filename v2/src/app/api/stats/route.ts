import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { agentSessions, projects } from "@/db/schema";
import { computeStats } from "@/lib/stats";
import type { SessionRow } from "@/lib/stats.types";

// GET /api/stats — dashboard aggregates over all agent sessions. Auth required.
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select({
      id: agentSessions.id,
      status: agentSessions.status,
      model: agentSessions.model,
      gitBranch: agentSessions.gitBranch,
      project: projects.name,
      startedAt: agentSessions.startedAt,
      lastActivity: agentSessions.lastActivity,
      messageCount: agentSessions.messageCount,
      toolCount: agentSessions.toolCount,
      subAgentCount: agentSessions.subAgentCount,
      tokensIn: agentSessions.tokensIn,
      tokensOut: agentSessions.tokensOut,
      costUsd: agentSessions.costUsd,
      tools: agentSessions.tools,
      histo: agentSessions.histo,
    })
    .from(agentSessions)
    .leftJoin(projects, eq(agentSessions.projectId, projects.id));

  // Normalize Date columns to epoch-ms; computeStats works in numbers.
  const sessionRows: SessionRow[] = rows.map((r) => ({
    id: r.id,
    status: r.status,
    model: r.model,
    gitBranch: r.gitBranch,
    project: r.project,
    startedAt: r.startedAt ? r.startedAt.getTime() : null,
    lastActivity: r.lastActivity ? r.lastActivity.getTime() : null,
    messageCount: r.messageCount,
    toolCount: r.toolCount,
    subAgentCount: r.subAgentCount,
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
    costUsd: r.costUsd,
    tools: r.tools ?? null,
    histo: r.histo ?? null,
  }));

  return NextResponse.json(computeStats(sessionRows));
}
