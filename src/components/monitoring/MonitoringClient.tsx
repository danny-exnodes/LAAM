"use client";

// Unified monitoring home (F3). ONE entry point with three tabs:
//   • Agents  (default) — the RICH live AgentsClient (SSE + filter + cards + drawer
//     + click-through to /agents/[id] waterfall). It subsumes the old Local +
//     External(api/mcp) source tabs because api/mcp ARE agent_sessions, already
//     per-principal-filtered by the S2 SSE snapshot.
//   • Chat / Workflow — read-model tables over /api/monitoring (per-user Q2,
//     enforced server-side), with click-through to the existing /chat and
//     /workflows/[id] detail pages.
//
// The Agents tab is LIVE (SSE); the Chat/Workflow tables only refresh on demand.
// To stop users assuming everything auto-refreshes, the page shows a freshness
// line + a Sync button — distinguishing "UI live" from "data fresh".

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useT } from "@/i18n/provider";
import { monitoringDict } from "@/i18n/dictionaries/monitoring";
import { fmtDateTime } from "@/lib/format";
import { SyncButton } from "@/components/sync-button";
import { AgentsClient } from "@/components/agents/AgentsClient";

type Run = {
  id: string;
  source: "local" | "claude" | "chat" | "workflow" | "api" | "mcp";
  title: string;
  status: string | null;
  lastActivity: string | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  workflowId?: string | null;
};

type Tab = "agents" | "chat" | "workflow";

const TABS: Tab[] = ["agents", "chat", "workflow"];

function isTab(v: string | undefined): v is Tab {
  return v === "agents" || v === "chat" || v === "workflow";
}

// Click-through to the EXISTING detail page for a read-model row.
function hrefFor(r: Run): string {
  if (r.source === "workflow") {
    return r.workflowId ? `/workflows/${r.workflowId}?run=${r.id}` : "/workflows";
  }
  return "/chat"; // chat conversations open in the chat page
}

export function MonitoringClient({ initialTab }: { initialTab?: string }) {
  const t = useT(monitoringDict);
  const [tab, setTab] = useState<Tab>(isTab(initialTab) ? initialTab : "agents");
  // When the read-model tables last loaded their data (null = live/agents tab).
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  // Bumped by the Sync button so the active read-model table re-fetches.
  const [reloadNonce, setReloadNonce] = useState(0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{t("monitoring.title")}</h1>
        <p className="mt-1 text-sm text-neutral-500">{t("monitoring.subtitle")}</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" className="flex flex-wrap gap-1.5">
          {TABS.map((tk) => (
            <button
              key={tk}
              role="tab"
              aria-selected={tab === tk}
              onClick={() => setTab(tk)}
              className={
                "rounded-lg px-3 py-1.5 text-sm font-medium transition " +
                (tab === tk
                  ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                  : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800")
              }
            >
              {t(`monitoring.tab.${tk}`)}
            </button>
          ))}
        </div>
        {/* Freshness + Sync — visible on every tab so "UI live" (Agents/SSE) is
            never confused with "data fresh" (read-model tables load on demand). */}
        <div className="flex items-center gap-2">
          <Freshness live={tab === "agents"} loadedAt={loadedAt} />
          <SyncButton onSynced={() => setReloadNonce((n) => n + 1)} />
        </div>
      </div>

      {tab === "agents" ? (
        // Live (SSE) — AgentsClient owns its own freshness via the live dot.
        <AgentsClient embedded />
      ) : (
        <RunTable tab={tab} reloadNonce={reloadNonce} onLoaded={setLoadedAt} />
      )}
    </div>
  );
}

// Read-model table for the Chat / Workflow tabs. Fetches /api/monitoring?source=<tab>
// (server-side Q2 per-user filter) and renders rows with click-through links.
function RunTable({
  tab,
  reloadNonce,
  onLoaded,
}: {
  tab: "chat" | "workflow";
  reloadNonce: number;
  onLoaded: (at: number | null) => void;
}) {
  const t = useT(monitoringDict);
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    setRuns(null);
    setErr(false);
    onLoaded(null);
    fetch(`/api/monitoring?source=${tab}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("monitoring"))))
      .then((d) => {
        if (!alive) return;
        setRuns(d.runs as Run[]);
        onLoaded(Date.now());
      })
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
    // onLoaded is a stable setState dispatcher — intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, reloadNonce]);

  return (
    <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      {err ? (
        <p className="p-5 text-sm text-red-600">{t("monitoring.error")}</p>
      ) : runs === null ? (
        <p className="p-5 text-sm text-neutral-500">{t("monitoring.loading")}</p>
      ) : runs.length === 0 ? (
        <p className="p-5 text-sm text-neutral-500">{t("monitoring.empty")}</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-100 text-left text-xs text-neutral-500 dark:border-neutral-800">
            <tr>
              <th className="px-4 py-2.5 font-medium">{t("monitoring.col.title")}</th>
              <th className="px-4 py-2.5 font-medium">{t("monitoring.col.status")}</th>
              <th className="px-4 py-2.5 font-medium">{t("monitoring.col.lastActivity")}</th>
              <th className="px-4 py-2.5 text-right font-medium">{t("monitoring.col.tokens")}</th>
              <th className="px-4 py-2.5 text-right font-medium">{t("monitoring.col.cost")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {runs.map((r) => (
              <tr key={r.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                <td className="max-w-[28ch] truncate px-4 py-2.5 font-medium">
                  <Link href={hrefFor(r)} className="hover:underline">
                    {r.title}
                  </Link>
                </td>
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
  );
}

// Relative "data Xs ago" line. On the live Agents tab it reads "data just now"
// (the cards stream over SSE); on a read-model tab it ticks up from the last load.
function Freshness({ live, loadedAt }: { live: boolean; loadedAt: number | null }) {
  const t = useT(monitoringDict);
  const [, force] = useState(0);

  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const label = useMemo(() => {
    if (live) return t("monitoring.live");
    if (loadedAt === null) return t("monitoring.syncedJustNow");
    const secs = Math.max(0, Math.floor((Date.now() - loadedAt) / 1000));
    return secs < 1 ? t("monitoring.syncedJustNow") : t("monitoring.syncedAgo", { n: secs });
  }, [live, loadedAt, t]);

  return (
    <span data-testid="monitoring-freshness" className="text-xs text-neutral-400">
      {label}
    </span>
  );
}
