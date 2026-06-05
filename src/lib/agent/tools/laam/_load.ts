// SP-3 — loader dùng chung agent_session → SessionRow (cho query-stats + proactive).
// Rút ra đây để KHÔNG có bản sao thứ 3 (verdict A2(b); chủ SP-1 authorize sửa query-stats).
// Lưu ý: select+map này vẫn nhân bản từ src/app/api/stats/route.ts (nguồn chân lý) — nếu
// đổi shape, sửa cả 2. Repoint /api/stats sang đây = follow-up tùy chọn (giữ test xanh).
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agentSessions, projects } from "@/db/schema";
import type { SessionRow } from "@/lib/stats.types";

export async function loadSessionRows(): Promise<SessionRow[]> {
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
  return rows.map((r) => ({
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
}
