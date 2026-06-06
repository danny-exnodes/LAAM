import { ilike, desc } from "drizzle-orm";
import { db } from "@/db";
import { agentSessions } from "@/db/schema";
import { isStuck } from "@/lib/stuck";
import type { Tool } from "../../types";

const STUCK_MIN = 10;

export type SearchRow = {
  id: string;
  projectId: string | null;
  machineId: string | null;
  model: string | null;
  status: string | null;
  lastActivity: Date | null;
  latestActivity: string | null;
};

export function shapeSearch(rows: SearchRow[], now: number) {
  return rows.map((r) => ({
    id: r.id,
    project: r.projectId,
    machineId: r.machineId,
    model: r.model,
    status: r.status,
    stuck: isStuck({ status: r.status ?? "", lastActivity: r.lastActivity }, STUCK_MIN, now),
    latestActivity: r.latestActivity,
    lastActivity: r.lastActivity ? r.lastActivity.toISOString() : null,
  }));
}

export const searchSessions: Tool = {
  name: "laam_search_sessions",
  description:
    "Tìm phiên agent theo TỪ KHOÁ trong việc đang làm (latestActivity) — vd 'sửa bug auth', 'viết test'. " +
    "Khác laam_list_agents (lọc theo status/máy): đây là khớp văn bản. Trả phiên mới nhất trước.",
  kind: "read",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "từ khoá cần tìm trong việc đang làm" },
      limit: { type: "number", description: "số tối đa, mặc định 10" },
    },
    required: ["query"],
  },
  async handler(args, ctx) {
    const q = String(args.query ?? "").trim();
    const limit = Math.min(Number(args.limit) || 10, 30);
    const rows = await db
      .select({
        id: agentSessions.id,
        projectId: agentSessions.projectId,
        machineId: agentSessions.machineId,
        model: agentSessions.model,
        status: agentSessions.status,
        lastActivity: agentSessions.lastActivity,
        latestActivity: agentSessions.latestActivity,
      })
      .from(agentSessions)
      .where(ilike(agentSessions.latestActivity, `%${q}%`))
      .orderBy(desc(agentSessions.lastActivity))
      .limit(limit);
    return { query: q, matches: shapeSearch(rows as SearchRow[], ctx.now) };
  },
};
