import { computeStats } from "@/lib/stats";
import type { Stats } from "@/lib/stats.types";
import type { Tool } from "../../types";
import { loadSessionRows } from "./_load";

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

export const queryStats: Tool = {
  name: "laam_query_stats",
  description:
    "Tổng hợp số liệu toàn bộ agent: tổng phiên/đang chạy, token, chi phí, theo model, top project, top tool.",
  kind: "read",
  parameters: { type: "object", properties: {} },
  async handler() {
    return shapeStatsSummary(computeStats(await loadSessionRows()));
  },
};
