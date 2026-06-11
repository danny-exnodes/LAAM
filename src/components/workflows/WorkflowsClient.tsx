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

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { GitBranch, Play, Eye, Copy, AlertTriangle, Loader2, Pencil, Type, Trash2, MoreHorizontal } from "lucide-react";
import { useLang, useT } from "@/i18n/provider";
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

function fmtDate(d: Date | string | null, lang: string): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString(lang, { day: "2-digit", month: "2-digit", year: "numeric" });
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
  const { lang } = useLang();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [runMap, setRunMap] = useState<RunMap>({});
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState(false);

  // Template modal state
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [instantiating, setInstantiating] = useState<string | null>(null);

  // Per-row action states
  const [runningId, setRunningId] = useState<string | null>(null);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Row actions dropdown — only one open at a time
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  // Inline rename (A3) — renameId = the row being renamed; draft holds the edited name.
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const handleRename = useCallback(
    async (wfId: string) => {
      const name = renameDraft.trim();
      setRenameId(null);
      if (!name) return;
      setWorkflows((prev) => prev.map((w) => (w.id === wfId ? { ...w, name } : w))); // optimistic
      setActionError(null);
      try {
        const res = await fetch(`/api/workflows/${encodeURIComponent(wfId)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) setActionError(t("wf.actionErr"));
      } catch {
        setActionError(t("wf.actionErr"));
      }
    },
    [renameDraft, t],
  );
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!openMenuId) return;
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [openMenuId]);

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
      setActionError(null);
      try {
        const res = await fetch(`/api/workflows/${encodeURIComponent(wfId)}/run`, { method: "POST" });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setActionError(body.error ?? t("wf.runFailed"));
          return;
        }
        const data = (await res.json()) as { run?: { status?: string; error?: string } };
        if (data?.run?.status === "failed") {
          setActionError(`${t("wf.runFailed")}: ${data.run.error ?? "—"}`);
        }
        // Re-fetch runs to show new run status.
        await load();
      } catch {
        setActionError(t("wf.runFailed"));
      } finally {
        setRunningId(null);
      }
    },
    [load, t],
  );

  const handleClone = useCallback(
    async (wfId: string) => {
      setCloningId(wfId);
      setActionError(null);
      try {
        const res = await fetch(`/api/workflows/${encodeURIComponent(wfId)}/clone`, { method: "POST" });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setActionError(body.error ?? t("wf.cloneFailed"));
          return;
        }
        await load();
      } catch {
        setActionError(t("wf.cloneFailed"));
      } finally {
        setCloningId(null);
      }
    },
    [load, t],
  );

  const handleDelete = useCallback(
    async (wfId: string, wfName: string) => {
      if (!window.confirm(`${t("wf.deleteConfirm")}\n\n"${wfName}"`)) return;
      setDeletingId(wfId);
      setActionError(null);
      try {
        const res = await fetch(`/api/workflows/${encodeURIComponent(wfId)}`, { method: "DELETE" });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setActionError(body.error ?? t("wf.deleteFailed"));
          return;
        }
        await load();
      } catch {
        setActionError(t("wf.deleteFailed"));
      } finally {
        setDeletingId(null);
      }
    },
    [load, t],
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
      setActionError(null);
      try {
        const res = await fetch("/api/workflows/templates", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ templateId }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setActionError(body.error ?? t("wf.actionErr"));
          return;
        }
        setShowTemplateModal(false);
        await load();
      } catch {
        setActionError(t("wf.actionErr"));
      } finally {
        setInstantiating(null);
      }
    },
    [load, t],
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

        {actionError && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400">
            <span>{actionError}</span>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="flex-none text-xs text-red-400 underline hover:text-red-600"
            >
              ✕
            </button>
          </div>
        )}

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
                  const isDeleting = deletingId === wf.id;

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
                            {renameId === wf.id ? (
                              <input
                                autoFocus
                                value={renameDraft}
                                onChange={(e) => setRenameDraft(e.target.value)}
                                onBlur={() => void handleRename(wf.id)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") { e.preventDefault(); void handleRename(wf.id); }
                                  if (e.key === "Escape") setRenameId(null);
                                }}
                                aria-label={t("wf.renameLabel")}
                                className="w-full rounded border border-[var(--color-accent)] bg-transparent px-1.5 py-0.5 text-sm font-medium focus:outline-none"
                              />
                            ) : (
                              <Link
                                href={`/workflows/${encodeURIComponent(wf.id)}`}
                                className="font-medium transition hover:text-[var(--color-accent)] hover:underline"
                              >
                                {wf.name}
                              </Link>
                            )}
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
                        {lastRun ? fmtDate(lastRun.createdAt, lang) : "—"}
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
                      <td className="px-4 py-3 text-neutral-500">{fmtDate(wf.createdAt, lang)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {/* Run — always visible (most frequent action) */}
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

                          {/* ⋯ dropdown for the rest */}
                          <div className="relative" ref={openMenuId === wf.id ? menuRef : undefined}>
                            <button
                              type="button"
                              title={t("wf.col.actions")}
                              aria-label={t("wf.col.actions")}
                              className={btn("icon")}
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(openMenuId === wf.id ? null : wf.id);
                              }}
                            >
                              <MoreHorizontal size={15} aria-hidden />
                            </button>

                            {openMenuId === wf.id && (
                              <div className="absolute right-0 top-full z-20 mt-1 min-w-[140px] rounded-xl border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                                <Link
                                  href={`/workflows/${encodeURIComponent(wf.id)}`}
                                  aria-label={t("wf.view")}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
                                  onClick={() => setOpenMenuId(null)}
                                >
                                  <Eye size={14} aria-hidden />
                                  {t("wf.view")}
                                </Link>
                                <Link
                                  href={`/workflows/${encodeURIComponent(wf.id)}/edit`}
                                  aria-label={t("wf.edit")}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
                                  onClick={() => setOpenMenuId(null)}
                                >
                                  <Pencil size={14} aria-hidden />
                                  {t("wf.edit")}
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => { setOpenMenuId(null); setRenameDraft(wf.name); setRenameId(wf.id); }}
                                  aria-label={t("wf.rename")}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
                                >
                                  <Type size={14} aria-hidden />
                                  {t("wf.rename")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setOpenMenuId(null); void handleClone(wf.id); }}
                                  disabled={isCloning}
                                  aria-label={t("wf.clone")}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
                                >
                                  {isCloning ? (
                                    <Loader2 size={14} className="animate-spin" aria-hidden />
                                  ) : (
                                    <Copy size={14} aria-hidden />
                                  )}
                                  {t("wf.clone")}
                                </button>
                                <div className="my-1 border-t border-neutral-100 dark:border-neutral-800" />
                                <button
                                  type="button"
                                  onClick={() => { setOpenMenuId(null); void handleDelete(wf.id, wf.name); }}
                                  disabled={isDeleting}
                                  aria-label={t("wf.delete")}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/20"
                                >
                                  {isDeleting ? (
                                    <Loader2 size={14} className="animate-spin" aria-hidden />
                                  ) : (
                                    <Trash2 size={14} aria-hidden />
                                  )}
                                  {t("wf.delete")}
                                </button>
                              </div>
                            )}
                          </div>
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
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
