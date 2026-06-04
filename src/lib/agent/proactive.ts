// SP-3 — phát hiện agent kẹt / chi phí cao từ dữ liệu agent_session (dùng chung, qua _load).
// Tái dùng isStuck (không nhân bản). COST-ALERT = tuyệt đối/burn-rate trên phiên CHƯA done —
// KHÔNG phải Δcost/Δt windowed (agent_session chỉ có TỔNG cost/phiên — giới hạn dữ liệu, D-SP3-5).
import type { SessionRow } from "@/lib/stats.types";
import { isStuck } from "@/lib/stuck";

export type ProactiveAlert = {
  type: "stuck" | "cost";
  key: string; // dedupe ổn định: `stuck:<id>` | `cost:<id>`
  sessionId: string;
  project: string | null;
  minutesIdle?: number;
  costUsd?: number;
};

export type ProactiveState = { surfaced: Record<string, number> }; // key -> epoch ms lần nêu cuối

const STUCK_MIN = 10;
const COST_USD = 1.0;
const BURN_USD_PER_MIN = 0.1;
const MAX_ALERTS = 5;
const COOLDOWN_MS = 6 * 3600 * 1000;
const PRUNE_MS = 24 * 3600 * 1000;

export function detectAlerts(
  rows: SessionRow[],
  now: number,
  opts: { stuckMin?: number; costUsd?: number; burnUsdPerMin?: number; max?: number } = {},
): ProactiveAlert[] {
  const stuckMin = opts.stuckMin ?? STUCK_MIN;
  const costThr = opts.costUsd ?? COST_USD;
  const burnThr = opts.burnUsdPerMin ?? BURN_USD_PER_MIN;
  const max = opts.max ?? MAX_ALERTS;

  const alerts: ProactiveAlert[] = [];
  for (const s of rows) {
    if (isStuck({ status: s.status ?? "", lastActivity: s.lastActivity }, stuckMin, now)) {
      const minutesIdle = s.lastActivity != null ? Math.round((now - s.lastActivity) / 60000) : 0;
      alerts.push({ type: "stuck", key: `stuck:${s.id}`, sessionId: s.id, project: s.project, minutesIdle });
    }
  }
  for (const s of rows) {
    if (s.status === "done") continue;
    const cost = s.costUsd ?? 0;
    const durMin = s.startedAt != null && s.lastActivity != null ? (s.lastActivity - s.startedAt) / 60000 : 0;
    const burn = durMin > 0 ? cost / durMin : 0;
    if (cost >= costThr || burn >= burnThr) {
      alerts.push({ type: "cost", key: `cost:${s.id}`, sessionId: s.id, project: s.project, costUsd: cost });
    }
  }
  return alerts.slice(0, max);
}

export function selectNewAlerts(
  alerts: ProactiveAlert[],
  state: ProactiveState | null,
  now: number,
  cooldownMs: number = COOLDOWN_MS,
): { toSurface: ProactiveAlert[]; newState: ProactiveState } {
  const surfaced: Record<string, number> = { ...(state?.surfaced ?? {}) };
  const toSurface: ProactiveAlert[] = [];
  for (const a of alerts) {
    const last = surfaced[a.key];
    if (last == null || now - last > cooldownMs) {
      toSurface.push(a);
      surfaced[a.key] = now;
    }
  }
  for (const k of Object.keys(surfaced)) {
    if (surfaced[k] < now - PRUNE_MS) delete surfaced[k]; // gọn state
  }
  return { toSurface, newState: { surfaced } };
}

type NoticeStrings = {
  lead: string; tail: string;
  stuckHead: (n: number) => string; costHead: (n: number) => string;
  idle: (m?: number) => string; money: (c?: number) => string;
};
const STR: Record<string, NoticeStrings> = {
  vi: { lead: "⚠️ Lưu ý chủ động:", tail: "Nếu liên quan, hãy nhắc người dùng.",
    stuckHead: (n) => `${n} agent đang kẹt`, costHead: (n) => `${n} agent chi phí cao`,
    idle: (m) => `kẹt ${m}′`, money: (c) => `$${(c ?? 0).toFixed(2)}` },
  en: { lead: "⚠️ Proactive note:", tail: "Mention to the user if relevant.",
    stuckHead: (n) => `${n} agent(s) stuck`, costHead: (n) => `${n} agent(s) costly`,
    idle: (m) => `idle ${m}m`, money: (c) => `$${(c ?? 0).toFixed(2)}` },
  zh: { lead: "⚠️ 主动提示：", tail: "如相关请提醒用户。",
    stuckHead: (n) => `${n} 个 agent 卡住`, costHead: (n) => `${n} 个 agent 费用偏高`,
    idle: (m) => `闲置 ${m} 分`, money: (c) => `$${(c ?? 0).toFixed(2)}` },
};

export function formatProactiveNotice(alerts: ProactiveAlert[], lang: string): string {
  if (!alerts.length) return "";
  const s = STR[lang] ?? STR.vi;
  const proj = (a: ProactiveAlert) => a.project ?? a.sessionId;
  const stuck = alerts.filter((a) => a.type === "stuck");
  const cost = alerts.filter((a) => a.type === "cost");
  const parts: string[] = [];
  if (stuck.length)
    parts.push(`${s.stuckHead(stuck.length)} — ${stuck.map((a) => `${proj(a)} (${s.idle(a.minutesIdle)})`).join(", ")}`);
  if (cost.length)
    parts.push(`${s.costHead(cost.length)} — ${cost.map((a) => `${proj(a)} (${s.money(a.costUsd)})`).join(", ")}`);
  return `${s.lead} ${parts.join("; ")}. ${s.tail}`;
}
