"use client";

// Workflows list page. Consumes:
//   GET  /api/workflows            — list user's workflows (with last-run status)
//   GET  /api/workflows/runs       — last run per workflow (for status badge)
//   GET  /api/workflows/templates  — template list for New-from-template
//   POST /api/workflows            — create from template (instantiate)
//   POST /api/workflows/[id]/run   — manual Run-now
//   POST /api/workflows/[id]/clone — clone
//
// Realtime: useWorkflowEvents streams SSE workflow_run events and updates
// the run-status badge live without polling.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { GitBranch, Play, Eye, Copy, AlertTriangle, Loader2, Pencil } from "lucide-react";
import { useT } from "@/i18n/provider";
import { workflows as dict } from "@/i18n/dictionaries/workflows";
import { PageHeader } from "@/components/page-header";
import { useWorkflowEvents } from "@/hooks/useWorkflowEvents";
import type { Workflow, WorkflowRun } from "@/db/schema";

// ----- Types -----

type WorkflowTemplate = {
  id: string;
  name: string;
  description: string;
  moatLeaning: boolean;
};

type RunMap = Record<string, WorkflowRun>; // workflowId → latest run

// ----- Helpers -----

function statusBadgeClass(status: string | null): string {
  if (!status) return "bg-neutral-100 text-neutral-500 dark:bg-neutral-800";
  if (status === "succeeded") return "bg-green-500/15 text-green-600 dark:text-green-400";
  if (status === "failed") return "bg-red-500/15 text-red-500 dark:text-red-400";
  if (status === "running") return "bg-blue-500/15 text-blue-600 dark:text-blue-400";
  if (status === "queued") return "bg-yellow-500/15 text-yellow-600 dark:text-yellow-500";
  return "bg-neutral-100 text-neutral-500 dark:bg-neutral-800";
}

function wfStatusBadgeClass(status: string): string {
  if (status === "active") return "bg-green-500/15 text-green-600 dark:text-green-400";
  if (status === "disabled") return "bg-neutral-100 text-neutral-400 dark:bg-neutral-800";
  return "bg-yellow-500/15 text-yellow-600 dark:text-yellow-500"; // draft
}

function fmtDate(d: Date | string | null): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function btn(kind: "primary" | "secondary" | "danger" | "icon") {
  const base = "rounded-lg px-3 py-1.5 text-sm font-semibold transition disabled:cursor-default disabled:opacity-50";
  if (kind === "primary") return base + " bg-[var(--color-accent)] text-white hover:opacity-90";
  if (kind === "danger")
    return base + " border border-neutral-200 text-neutral-600 hover:border-red-500 hover:bg-red-500 hover:text-white dark:border-neutral-700 dark:text-neutral-300";
  if (kind === "icon")
    return "rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200 transition";
  return base + " border border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800";
}

// ----- Main component -----

export function WorkflowsClient() {
  const t = useT(dict);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [runMap, setRunMap] = useState<RunMap>({});
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState(false);

  // Template modal state
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [instantiating, setInstantiating] = useState<string | null>(null);

  // Per-row running state
  const [runningId, setRunningId] = useState<string | null>(null);
  const [cloningId, setCloningId] = useState<string | null>(null);

  // Realtime: SSE workflow events
  const { runStatus, activeRunId } = useWorkflowEvents();

  // When a SSE run event arrives, update the runMap live.
  useEffect(() => {
    if (!activeRunId || !runStatus) return;
    setRunMap((prev) => {
      // Find which workflow this run belongs to.
      const wf = workflows.find((w) => {
        const r = prev[w.id];
        return r?.id === activeRunId;
      });
      if (!wf) return prev;
      const existing = prev[wf.id];
      if (!existing) return prev;
      return { ...prev, [wf.id]: { ...existing, status: runStatus } };
    });
  }, [activeRunId, runStatus, workflows]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr(false);
    try {
      const [wfRes, runsRes] = await Promise.all([
        fetch("/api/workflows"),
        fetch("/api/workflows/runs"),
      ]);
      if (!wfRes.ok || !runsRes.ok) throw new Error("load failed");
      const wfData: Workflow[] = await wfRes.json();
      const runsData: WorkflowRun[] = await runsRes.json();

      // Build runMap: latest run per workflow (runs are already ordered desc).
      const map: RunMap = {};
      for (const run of runsData) {
        if (!map[run.workflowId]) map[run.workflowId] = run;
      }

      setWorkflows(wfData);
      setRunMap(map);
    } catch {
      setLoadErr(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRunNow = useCallback(
    async (wfId: string) => {
      setRunningId(wfId);
      try {
        await fetch(`/api/workflows/${encodeURIComponent(wfId)}/run`, { method: "POST" });
        // Re-fetch runs to show new run status.
        await load();
      } finally {
        setRunningId(null);
      }
    },
    [load],
  );

  const handleClone = useCallback(
    async (wfId: string) => {
      setCloningId(wfId);
      try {
        await fetch(`/api/workflows/${encodeURIComponent(wfId)}/clone`, { method: "POST" });
        await load();
      } finally {
        setCloningId(null);
      }
    },
    [load],
  );

  const openTemplateModal = useCallback(async () => {
    setShowTemplateModal(true);
    if (templates.length > 0) return;
    setTemplatesLoading(true);
    try {
      const res = await fetch("/api/workflows/templates");
      const data: WorkflowTemplate[] = await res.json();
      setTemplates(data);
    } finally {
      setTemplatesLoading(false);
    }
  }, [templates.length]);

  const handleInstantiate = useCallback(
    async (templateId: string) => {
      setInstantiating(templateId);
      try {
        await fetch("/api/workflows/templates", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ templateId }),
        });
        setShowTemplateModal(false);
        await load();
      } finally {
        setInstantiating(null);
      }
    },
    [load],
  );

  // Needs-attention: workflows whose last run is "failed".
  const needsAttentionIds = new Set(
    Object.entries(runMap)
      .filter(([, run]) => run.status === "failed")
      .map(([wfId]) => wfId),
  );

  const topActions = (
    <div className="flex items-center gap-2">
      <Link href="/workflows/new" className={btn("primary")}>
        {t("wf.newBlank")}
      </Link>
      <button type="button" onClick={() => void openTemplateModal()} className={btn("secondary")}>
        {t("wf.newFromTemplate")}
      </button>
    </div>
  );

  return (
    <>
      <main className="w-full px-4 pt-4 pb-24 sm:px-6 sm:pt-6 md:pb-8">
        <PageHeader
          title={t("wf.heading")}
          subtitle={t("wf.sub")}
          actions={topActions}
        />

        {loadErr ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 p-12 text-center text-neutral-500 dark:border-neutral-700">
            {t("wf.loadErr")}
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-20 text-neutral-400">
            <Loader2 size={24} className="animate-spin" aria-hidden />
          </div>
        ) : workflows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 p-12 text-center dark:border-neutral-700">
            <GitBranch size={32} className="mx-auto mb-3 text-neutral-300" aria-hidden />
            <p className="font-medium">{t("wf.emptyNone")}</p>
            <p className="mt-1 text-sm text-neutral-500">{t("wf.emptyNoneSub")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-xs font-semibold text-neutral-500 dark:border-neutral-800">
                  <th className="px-4 py-3 text-left">{t("wf.col.name")}</th>
                  <th className="px-4 py-3 text-left">{t("wf.col.status")}</th>
                  <th className="px-4 py-3 text-left">{t("wf.col.lastRun")}</th>
                  <th className="px-4 py-3 text-left">{t("wf.col.lastRunStatus")}</th>
                  <th className="px-4 py-3 text-left">{t("wf.col.created")}</th>
                  <th className="px-4 py-3 text-right">{t("wf.col.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {workflows.map((wf) => {
                  const lastRun = runMap[wf.id] ?? null;
                  const attention = needsAttentionIds.has(wf.id);
                  const isRunning = runningId === wf.id;
                  const isCloning = cloningId === wf.id;

                  return (
                    <tr
                      key={wf.id}
                      className={
                        "hover:bg-neutral-50 dark:hover:bg-neutral-800/50 " +
                        (attention ? "bg-red-50/30 dark:bg-red-950/10" : "")
                      }
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {attention && (
                            <AlertTriangle
                              size={14}
                              className="flex-none text-red-500"
                              aria-label={t("wf.needsAttention")}
                            />
                          )}
                          <div>
                            <div className="font-medium">{wf.name}</div>
                            {wf.description && (
                              <div className="mt-0.5 line-clamp-1 max-w-xs text-xs text-neutral-500">
                                {wf.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={"rounded-full px-2 py-0.5 text-xs font-bold " + wfStatusBadgeClass(wf.status)}>
                          {t(`wf.wfStatus.${wf.status}` as Parameters<typeof t>[0]) || wf.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-neutral-500">
                        {lastRun ? fmtDate(lastRun.createdAt) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {lastRun ? (
                          <span className={"rounded-full px-2 py-0.5 text-xs font-bold " + statusBadgeClass(lastRun.status)}>
                            {t(`wf.runStatus.${lastRun.status}` as Parameters<typeof t>[0]) || lastRun.status}
                          </span>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-neutral-500">{fmtDate(wf.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => void handleRunNow(wf.id)}
                            disabled={isRunning}
                            title={t("wf.runNow")}
                            className={btn("icon")}
                            aria-label={t("wf.runNow")}
                          >
                            {isRunning ? (
                              <Loader2 size={15} className="animate-spin" aria-hidden />
                            ) : (
                              <Play size={15} aria-hidden />
                            )}
                          </button>
                          <Link
                            href={`/workflows/${encodeURIComponent(wf.id)}`}
                            title={t("wf.view")}
                            className={btn("icon")}
                            aria-label={t("wf.view")}
                          >
                            <Eye size={15} aria-hidden />
                          </Link>
                          <Link
                            href={`/workflows/${encodeURIComponent(wf.id)}/edit`}
                            title={t("wf.edit")}
                            className={btn("icon")}
                            aria-label={t("wf.edit")}
                          >
                            <Pencil size={15} aria-hidden />
                          </Link>
                          <button
                            type="button"
                            onClick={() => void handleClone(wf.id)}
                            disabled={isCloning}
                            title={t("wf.clone")}
                            className={btn("icon")}
                            aria-label={t("wf.clone")}
                          >
                            {isCloning ? (
                              <Loader2 size={15} className="animate-spin" aria-hidden />
                            ) : (
                              <Copy size={15} aria-hidden />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Template modal */}
      {showTemplateModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("wf.templateModal.title")}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowTemplateModal(false); }}
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl dark:bg-neutral-900">
            <h2 className="mb-4 text-lg font-bold">{t("wf.templateModal.title")}</h2>

            {templatesLoading ? (
              <div className="flex items-center justify-center py-8 text-neutral-400">
                <Loader2 size={20} className="animate-spin" aria-hidden />
              </div>
            ) : templates.length === 0 ? (
              <p className="text-sm text-neutral-500">{t("wf.templateModal.empty")}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {templates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="flex items-start justify-between gap-3 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800"
                  >
                    <div className="min-w-0">
                      <div className="font-medium">{tpl.name}</div>
                      <p className="mt-0.5 text-xs text-neutral-500">{tpl.description}</p>
                    </div>
                    <button
                      type="button"
                      disabled={instantiating === tpl.id}
                      onClick={() => void handleInstantiate(tpl.id)}
                      className={btn("secondary") + " flex-none"}
                    >
                      {instantiating === tpl.id ? (
                        <Loader2 size={13} className="animate-spin" aria-hidden />
                      ) : (
                        t("wf.templateModal.use")
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className={btn("secondary")}
              >
                {t("wf.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
