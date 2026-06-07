"use client";

import { useEffect, useState } from "react";
import { useT } from "@/i18n/provider";
import { monitoringDict } from "@/i18n/dictionaries/monitoring";
import { fmtDateTime } from "@/lib/format";

type Run = {
  id: string;
  source: "local" | "claude" | "chat" | "workflow" | "api" | "mcp";
  title: string;
  principal: string | null;
  status: string | null;
  startedAt: string | null;
  lastActivity: string | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  machineId: string | null;
};

// UI tab → the `source` query param(s) it maps to. "external" folds api+mcp.
type Tab = "all" | "local" | "chat" | "workflow" | "external";

const SOURCE_BADGE: Record<Run["source"], string> = {
  local: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  claude: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  chat: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  workflow: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  api: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  mcp: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

function matchesTab(tab: Tab, source: Run["source"]): boolean {
  if (tab === "all") return true;
  if (tab === "local") return source === "local" || source === "claude";
  if (tab === "external") return source === "api" || source === "mcp";
  return source === tab;
}

export function MonitoringClient() {
  const t = useT(monitoringDict);
  const [tab, setTab] = useState<Tab>("all");
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    setRuns(null);
    setErr(false);
    fetch("/api/monitoring")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (alive) setRuns(d.runs as Run[]);
      })
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, []);

  const tabs: Tab[] = ["all", "local", "chat", "workflow", "external"];
  const visible = (runs ?? []).filter((r) => matchesTab(tab, r.source));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{t("monitoring.title")}</h1>
        <p className="mt-1 text-sm text-neutral-500">{t("monitoring.subtitle")}</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {tabs.map((tk) => (
          <button
            key={tk}
            onClick={() => setTab(tk)}
            className={
              "rounded-lg px-3 py-1.5 text-sm font-medium transition " +
              (tab === tk
                ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800")
            }
          >
            {t(`monitoring.tab.${tk === "local" ? "local" : tk}`)}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        {err ? (
          <p className="p-5 text-sm text-red-600">{t("monitoring.error")}</p>
        ) : runs === null ? (
          <p className="p-5 text-sm text-neutral-500">{t("monitoring.loading")}</p>
        ) : visible.length === 0 ? (
          <p className="p-5 text-sm text-neutral-500">{t("monitoring.empty")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-100 text-left text-xs text-neutral-500 dark:border-neutral-800">
              <tr>
                <th className="px-4 py-2.5 font-medium">{t("monitoring.col.source")}</th>
                <th className="px-4 py-2.5 font-medium">{t("monitoring.col.title")}</th>
                <th className="px-4 py-2.5 font-medium">{t("monitoring.col.status")}</th>
                <th className="px-4 py-2.5 font-medium">{t("monitoring.col.lastActivity")}</th>
                <th className="px-4 py-2.5 text-right font-medium">{t("monitoring.col.tokens")}</th>
                <th className="px-4 py-2.5 text-right font-medium">{t("monitoring.col.cost")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {visible.map((r) => (
                <tr key={`${r.source}:${r.id}`}>
                  <td className="px-4 py-2.5">
                    <span className={"rounded-md px-2 py-0.5 text-xs font-medium " + SOURCE_BADGE[r.source]}>
                      {r.source}
                    </span>
                  </td>
                  <td className="max-w-[28ch] truncate px-4 py-2.5 font-medium">{r.title}</td>
                  <td className="px-4 py-2.5 text-neutral-500">{r.status ?? "—"}</td>
                  <td className="px-4 py-2.5 text-neutral-500">
                    {r.lastActivity ? fmtDateTime(r.lastActivity) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-neutral-500">
                    {r.tokensIn}/{r.tokensOut}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-neutral-500">
                    ${r.costUsd.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
