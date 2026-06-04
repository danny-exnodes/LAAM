import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agentSessions, type SubAgentJson, type ToolJson } from "@/db/schema";
import { isStuck } from "@/lib/stuck";
import type { Tool } from "../../types";

type DetailRow = {
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
  tools: ToolJson[] | null;
  subAgents: SubAgentJson[] | null;
  histo: Record<string, number> | null;
};

export function shapeAgentDetail(row: DetailRow | undefined, now: number, id: string) {
  if (!row) return { error: "không tìm thấy agent: " + id };
  return {
    agent: {
      id: row.id,
      project: row.projectId,
      machineId: row.machineId,
      model: row.model,
      status: row.status,
      stuck: isStuck({ status: row.status ?? "", lastActivity: row.lastActivity }, 10, now),
      latestActivity: row.latestActivity,
      startedAt: row.startedAt ? row.startedAt.toISOString() : null,
      lastActivity: row.lastActivity ? row.lastActivity.toISOString() : null,
      tokensIn: row.tokensIn,
      tokensOut: row.tokensOut,
      costUsd: row.costUsd,
      tools: row.tools ?? [],
      subAgents: row.subAgents ?? [],
    },
  };
}

export const getAgent: Tool = {
  name: "laam_get_agent",
  description: "Lấy chi tiết một agent theo id: trạng thái, việc đang làm, danh sách tool đã dùng, sub-agent.",
  kind: "read",
  parameters: {
    type: "object",
    properties: { id: { type: "string", description: "id phiên agent" } },
    required: ["id"],
  },
  async handler(args, ctx) {
    const id = String(args.id);
    const rows = await db.select().from(agentSessions).where(eq(agentSessions.id, id)).limit(1);
    return shapeAgentDetail(rows[0] as unknown as DetailRow | undefined, ctx.now, id);
  },
};
