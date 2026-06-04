import { ne } from "drizzle-orm";
import { db } from "@/db";
import { agentSessions } from "@/db/schema";
import { isStuck } from "@/lib/stuck";
import type { Tool } from "../../types";
import { shapeAgents, type AgentRow } from "./list-agents";

export function filterStuck(rows: AgentRow[], thresholdMin: number, now: number): AgentRow[] {
  return rows.filter((r) => isStuck({ status: r.status ?? "", lastActivity: r.lastActivity }, thresholdMin, now));
}

export const findStuck: Tool = {
  name: "laam_find_stuck",
  description: "Tìm các agent đang bị kẹt (chưa done nhưng không hoạt động quá ngưỡng phút, mặc định 10).",
  kind: "read",
  parameters: {
    type: "object",
    properties: { thresholdMin: { type: "number", description: "ngưỡng phút, mặc định 10" } },
  },
  async handler(args, ctx) {
    const thr = Number(args.thresholdMin) || 10;
    const rows = (await db
      .select()
      .from(agentSessions)
      .where(ne(agentSessions.status, "done"))) as unknown as AgentRow[];
    const stuck = filterStuck(rows, thr, ctx.now);
    return { thresholdMin: thr, stuck: shapeAgents(stuck, ctx.now) };
  },
};
