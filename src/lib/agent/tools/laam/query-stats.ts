import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agentSessions, projects } from "@/db/schema";
import { computeStats } from "@/lib/stats";
import type { SessionRow, Stats } from "@/lib/stats.types";
import type { Tool } from "../../types";

// Trả bản TÓM TẮT (không gửi heatmap/activity dài → tránh tràn context model).
export function shapeStatsSummary(stats: Stats) {
  return {
    totals: stats.totals,
    byStatus: stats.byStatus,
    byModel: stats.byModel,
    topProjects: stats.byProject.slice(0, 5),
    topTools: stats.toolLeaderboard.slice(0, 5),
  };
}

// Lưu ý: select+map dưới đây nhân bản từ src/app/api/stats/route.ts (nguồn chân lý).
// Cố ý không refactor route đang chạy ở SP-1 (surgical). Nếu đổi shape, sửa cả 2.
async function loadSessionRows(): Promise<SessionRow[]> {
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

export const queryStats: Tool = {
  name: "laam_query_stats",
  description: "Tổng hợp số liệu toàn bộ agent: tổng phiên/đang chạy, token, chi phí, theo model, top project, top tool.",
  kind: "read",
  parameters: { type: "object", properties: {} },
  async handler() {
    return shapeStatsSummary(computeStats(await loadSessionRows()));
  },
};
