// laam_metrics_digest — GROUND-TRUTH monitoring metrics computed in CODE (Rule 13).
//
// The "moat digest" workflows used to ask the local 8B to reconstruct numbers ("82 agents
// completed, 717k/1.2M tokens") from raw tool output — which it can hallucinate. This tool
// computes the numbers deterministically (computeStats + isStuck) and returns a ready-to-
// embed `summary` block; the digest templates instruct the agent to reproduce it VERBATIM
// and only add prose around it. Numbers come from code; the model never invents them.
import { computeStats } from "@/lib/stats";
import { isStuck } from "@/lib/stuck";
import type { Stats } from "@/lib/stats.types";
import type { Tool } from "../../types";
import { loadSessionRows } from "./_load";

const STUCK_MIN = 10;

export type SessionLite = { id: string; project: string | null; tokens: number };

function fmtInt(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Pure: build the verbatim ground-truth markdown block. Unit-tested (no DB/model).
export function formatMetricsDigest(
  stats: Stats,
  stuck: SessionLite[],
  topBurners: SessionLite[],
  now: number,
  thresholdMin: number,
): string {
  const tot = stats.totals;
  const totalTokens = tot.tokensIn + tot.tokensOut;
  const lines: string[] = [];
  lines.push(`**📊 Số liệu ground-truth (code tính lúc ${new Date(now).toISOString()} — KHÔNG sửa số):**`);
  lines.push(`- Phiên: ${fmtInt(tot.sessions)} tổng — ${fmtInt(tot.running)} đang chạy · ${fmtInt(tot.idle)} idle · ${fmtInt(tot.done)} xong`);
  lines.push(`- Token: ${fmtInt(tot.tokensIn)} vào · ${fmtInt(tot.tokensOut)} ra (tổng ${fmtInt(totalTokens)})`);
  lines.push(`- Chi phí ước tính: $${tot.costUsd.toFixed(2)}`);
  lines.push(`- Phiên kẹt (≥${thresholdMin}′): ${fmtInt(stuck.length)}`);
  for (const s of stuck.slice(0, 3)) {
    lines.push(`  - kẹt: ${s.id}${s.project ? ` (${s.project})` : ""} — ${fmtInt(s.tokens)} token`);
  }
  if (topBurners.length) {
    const top = topBurners.slice(0, 3).map((b) => `${b.id}${b.project ? ` (${b.project})` : ""} ${fmtInt(b.tokens)}`).join(" · ");
    lines.push(`- Top đốt token: ${top}`);
  }
  return lines.join("\n");
}

export const metricsDigest: Tool = {
  name: "laam_metrics_digest",
  description:
    "Số liệu GROUND-TRUTH (code tính, không phải model bịa) cho digest vận hành: tổng phiên/đang chạy/idle/xong, " +
    "token vào-ra, chi phí, phiên kẹt, top đốt token. Trả {metrics, stuck, topBurners, summary}. " +
    "QUAN TRỌNG: chèn NGUYÊN VĂN block `summary` vào digest và KHÔNG sửa bất kỳ con số nào (Rule 13).",
  kind: "read",
  parameters: {
    type: "object",
    properties: { stuckThresholdMin: { type: "number", description: "ngưỡng phút coi là kẹt, mặc định 10" } },
  },
  async handler(args, ctx) {
    const thr = Number(args.stuckThresholdMin) || STUCK_MIN;
    const rows = await loadSessionRows();
    const stats = computeStats(rows);
    const withTokens = rows.map((r) => ({ id: r.id, project: r.project, tokens: (r.tokensIn || 0) + (r.tokensOut || 0) }));
    const stuck = rows
      .filter((r) => isStuck({ status: r.status ?? "", lastActivity: r.lastActivity }, thr, ctx.now))
      .map((r) => ({ id: r.id, project: r.project, tokens: (r.tokensIn || 0) + (r.tokensOut || 0) }))
      .sort((a, b) => b.tokens - a.tokens);
    const topBurners = [...withTokens].sort((a, b) => b.tokens - a.tokens).slice(0, 5);
    return {
      metrics: { ...stats.totals, stuckCount: stuck.length, generatedAt: new Date(ctx.now).toISOString() },
      stuck,
      topBurners,
      summary: formatMetricsDigest(stats, stuck, topBurners, ctx.now, thr),
    };
  },
};
