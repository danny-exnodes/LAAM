import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { agentSessions } from "@/db/schema";
import { isStuck } from "@/lib/stuck";
import type { Tool } from "../../types";

const STUCK_MIN = 10;

export type AgentRow = {
  id: string;
  projectId: string | null;
  machineId: string | null;
  model: string | null;
  status: string | null;
  startedAt: Date | null;
  lastActivity: Date | null;
  latestActivity: string | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
};

export function shapeAgents(rows: AgentRow[], now: number) {
  return rows.map((r) => ({
    id: r.id,
    project: r.projectId,
    machineId: r.machineId,
    model: r.model,
    status: r.status,
    stuck: isStuck({ status: r.status ?? "", lastActivity: r.lastActivity }, STUCK_MIN, now),
    latestActivity: r.latestActivity,
    startedAt: r.startedAt ? r.startedAt.toISOString() : null,
    durationMin:
      r.startedAt && r.lastActivity
        ? Math.round((r.lastActivity.getTime() - r.startedAt.getTime()) / 60000)
        : null,
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
    costUsd: r.costUsd,
  }));
}

export const listAgents: Tool = {
  name: "laam_list_agents",
  description:
    "Liệt kê các agent (phiên giám sát) cùng trạng thái, việc đang làm, token, chi phí. " +
    "Có thể lọc theo status (running/idle/done) hoặc machineId, sắp xếp theo sort, giới hạn limit.",
  kind: "read",
  parameters: {
    type: "object",
    properties: {
      status: { type: "string", description: "running | idle | done (tuỳ chọn)" },
      machineId: { type: "string", description: "lọc theo máy (tuỳ chọn)" },
      sort: { type: "string", description: "recent (gần nhất, mặc định) | cost (tốn tiền nhất) | tokens (nhiều token nhất)" },
      limit: { type: "number", description: "số tối đa, mặc định 20" },
    },
  },
  async handler(args, ctx) {
    const limit = Math.min(Number(args.limit) || 20, 50);
    const conds = [];
    if (typeof args.status === "string") conds.push(eq(agentSessions.status, args.status));
    if (typeof args.machineId === "string") conds.push(eq(agentSessions.machineId, args.machineId));
    const sort = String(args.sort || "recent");
    const order =
      sort === "cost"
        ? desc(agentSessions.costUsd)
        : sort === "tokens"
          ? desc(sql`${agentSessions.tokensIn} + ${agentSessions.tokensOut}`)
          : desc(agentSessions.lastActivity);
    const rows = await db
      .select()
      .from(agentSessions)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(order)
      .limit(limit);
    return { agents: shapeAgents(rows as unknown as AgentRow[], ctx.now) };
  },
};
