"use client";

// Workflow detail page. Consumes:
//   GET  /api/workflows                    — list (to find this workflow by id)
//   GET  /api/workflows/runs?workflowId=X  — run history
//   GET  /api/workflows/runs/[id]          — run detail with steps (on expand)
//   POST /api/workflows/[id]/run           — manual run-now
//   GET  /api/workflows/schedules          — list schedules (filtered client-side)
//   POST /api/workflows/schedules          — create schedule
//
// Realtime: useWorkflowEvents for live step updates on running runs.

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Play,
  Trash2,
  Power,
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Calendar,
} from "lucide-react";
import { useLang, useT } from "@/i18n/provider";
import { workflows as dict } from "@/i18n/dictionaries/workflows";
import { useWorkflowEvents } from "@/hooks/useWorkflowEvents";
import type { Workflow, WorkflowRun, WorkflowRunStep, WorkflowSchedule } from "@/db/schema";

// ----- Types -----
type RunDetail = { run: WorkflowRun; steps: WorkflowRunStep[] };

// ----- Helpers -----
function fmtDate(d: Date | string | null, lang: string): string {
  if (!d) return "—";
  return new Date(typeof d === "string" ? d : d.toISOString()).toLocaleString(lang);
}

function fmtDuration(start: Date | string | null, end: Date | string | null): string {
  if (!start || !end) return "—";
  const ms = new Date(end as string).getTime() - new Date(start as string).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function runStatusClass(status: string): string {
  if (status === "succeeded") return "bg-green-500/15 text-green-600 dark:text-green-400";
  if (status === "failed") return "bg-red-500/15 text-red-500 dark:text-red-400";
  if (status === "running") return "bg-blue-500/15 text-blue-600 dark:text-blue-400 animate-pulse";
  if (status === "queued") return "bg-yellow-500/15 text-yellow-600 dark:text-yellow-500";
  return "bg-neutral-100 text-neutral-500 dark:bg-neutral-800";
}

function stepStatusIcon(status: string) {
  if (status === "succeeded") return <CheckCircle2 size={14} className="text-green-500" aria-hidden />;
  if (status === "failed") return <XCircle size={14} className="text-red-500" aria-hidden />;
  if (status === "running") return <Loader2 size={14} className="animate-spin text-blue-500" aria-hidden />;
  return <Clock size={14} className="text-neutral-400" aria-hidden />;
}

function btn(kind: "primary" | "secondary") {
  const base = "rounded-lg px-3 py-1.5 text-sm font-semibold transition disabled:cursor-default disabled:opacity-50";
  if (kind === "primary") return base + " bg-[var(--color-accent)] text-white hover:opacity-90 flex items-center gap-1.5";
  return base + " border border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800";
}

// ----- Main component -----

export function WorkflowDetailClient({ workflowId }: { workflowId: string }) {
  const t = useT(dict);
  const { lang } = useLang();
  const router = useRouter();

  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [schedules, setSchedules] = useState<WorkflowSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // Run-now state + inline error feedback
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  // Delete state
  const [deleting, setDeleting] = useState(false);

  // Schedule action states
  const [cronEditId, setCronEditId] = useState<string | null>(null);
  const [cronDraft, setCronDraft] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingSchedId, setDeletingSchedId] = useState<string | null>(null);
  const [scheduleActionErr, setScheduleActionErr] = useState<string | null>(null);

  // Expanded run → steps
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [runDetails, setRunDetails] = useState<Record<string, RunDetail>>({});
  const [loadingRunId, setLoadingRunId] = useState<string | null>(null);

  // Schedule form
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [cronInput, setCronInput] = useState("");
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleNote, setScheduleNote] = useState<{ ok: boolean; msg: string } | null>(null);

  // Live SSE events
  const { steps: liveSteps, runStatus: liveRunStatus, activeRunId } = useWorkflowEvents();

  // Apply live step updates to the currently expanded run
  useEffect(() => {
    if (!activeRunId || liveSteps.length === 0) return;
    setRunDetails((prev) => {
      const detail = prev[activeRunId];
      if (!detail) return prev;
      // Merge live steps into the existing steps array.
      const merged = [...detail.steps];
      for (const ls of liveSteps) {
        const idx = merged.findIndex((s) => s.nodeId === ls.nodeId);
        const partial: Partial<WorkflowRunStep> = {
          status: ls.status,
          nodeId: ls.nodeId,
          seq: ls.seq,
        };
        if (idx >= 0) {
          merged[idx] = { ...merged[idx], ...partial };
        }
        // (don't add unknown steps; they're in-flight and will be fetched on expand)
      }
      return { ...prev, [activeRunId]: { run: detail.run, steps: merged } };
    });
  }, [liveSteps, activeRunId]);

  // Apply live run-level status update
  useEffect(() => {
    if (!activeRunId || !liveRunStatus) return;
    setRuns((prev) =>
      prev.map((r) => (r.id === activeRunId ? { ...r, status: liveRunStatus } : r)),
    );
  }, [activeRunId, liveRunStatus]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr(false);
    try {
      const [wfRes, runsRes, schedRes] = await Promise.all([
        fetch("/api/workflows"),
        fetch(`/api/workflows/runs?workflowId=${encodeURIComponent(workflowId)}`),
        fetch("/api/workflows/schedules"),
      ]);
      if (!wfRes.ok || !runsRes.ok || !schedRes.ok) throw new Error("load failed");
      const wfList: Workflow[] = await wfRes.json();
      const wf = wfList.find((w) => w.id === workflowId) ?? null;
      if (!wf) { setNotFound(true); setLoading(false); return; }
      const runsData: WorkflowRun[] = await runsRes.json();
      const schedsData: WorkflowSchedule[] = await schedRes.json();

      setWorkflow(wf);
      setRuns(runsData);
      setSchedules(schedsData.filter((s) => s.workflowId === workflowId));
    } catch {
      setLoadErr(true);
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => { void load(); }, [load]);

  const handleRunNow = useCallback(async () => {
    setRunning(true);
    setRunError(null);
    try {
      const res = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}/run`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setRunError(body.error ?? t("wf.runFailed"));
        return;
      }
      const data = (await res.json()) as { run?: { status?: string; error?: string } };
      if (data?.run?.status === "failed") {
        setRunError(`${t("wf.runFailed")}: ${data.run.error ?? "—"}`);
      }
      await load();
    } catch {
      setRunError(t("wf.runFailed"));
    } finally {
      setRunning(false);
    }
  }, [workflowId, load, t]);

  const handleDelete = useCallback(async () => {
    if (!workflow) return;
    if (!window.confirm(`${t("wf.deleteConfirm")}\n\n"${workflow.name}"`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setRunError(body.error ?? t("wf.deleteFailed"));
        return;
      }
      router.push("/workflows");
    } catch {
      setRunError(t("wf.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  }, [workflow, workflowId, router, t]);

  const handleToggleSchedule = useCallback(async (schedId: string, currentEnabled: boolean) => {
    setTogglingId(schedId);
    setScheduleActionErr(null);
    try {
      const res = await fetch(`/api/workflows/schedules/${encodeURIComponent(schedId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: !currentEnabled }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setScheduleActionErr(body.error ?? t("wf.schedule.toggleFailed"));
        return;
      }
      const updated = await res.json() as WorkflowSchedule;
      setSchedules(prev => prev.map(s => s.id === schedId ? updated : s));
    } catch {
      setScheduleActionErr(t("wf.schedule.toggleFailed"));
    } finally {
      setTogglingId(null);
    }
  }, [t]);

  const handleDeleteSchedule = useCallback(async (schedId: string) => {
    if (!window.confirm(t("wf.schedule.deleteConfirm"))) return;
    setDeletingSchedId(schedId);
    setScheduleActionErr(null);
    try {
      const res = await fetch(`/api/workflows/schedules/${encodeURIComponent(schedId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setScheduleActionErr(body.error ?? t("wf.schedule.deleteFailed"));
        return;
      }
      setSchedules(prev => prev.filter(s => s.id !== schedId));
    } catch {
      setScheduleActionErr(t("wf.schedule.deleteFailed"));
    } finally {
      setDeletingSchedId(null);
    }
  }, [t]);

  const handleSaveCron = useCallback(async (schedId: string) => {
    const cron = cronDraft.trim();
    if (!cron) { setCronEditId(null); return; }
    setScheduleActionErr(null);
    try {
      const res = await fetch(`/api/workflows/schedules/${encodeURIComponent(schedId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cron }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setScheduleActionErr(body.error ?? t("wf.schedule.cronSaveErr"));
        return;
      }
      const updated = await res.json() as WorkflowSchedule;
      setSchedules(prev => prev.map(s => s.id === schedId ? updated : s));
      setCronEditId(null);
    } catch {
      setScheduleActionErr(t("wf.schedule.cronSaveErr"));
    }
  }, [cronDraft, t]);

  const toggleRun = useCallback(async (runId: string) => {
    if (expandedRunId === runId) {
      setExpandedRunId(null);
      return;
    }
    setExpandedRunId(runId);
    if (runDetails[runId]) return; // already loaded
    setLoadingRunId(runId);
    try {
      const res = await fetch(`/api/workflows/runs/${encodeURIComponent(runId)}`);
      const data: RunDetail = await res.json();
      setRunDetails((prev) => ({ ...prev, [runId]: data }));
    } finally {
      setLoadingRunId(null);
    }
  }, [expandedRunId, runDetails]);

  const handleSaveSchedule = useCallback(async () => {
    if (!cronInput.trim()) return;
    setSavingSchedule(true);
    setScheduleNote(null);
    try {
      const res = await fetch("/api/workflows/schedules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workflowId, cron: cronInput.trim() }),
      });
      if (res.ok) {
        setScheduleNote({ ok: true, msg: t("wf.detail.scheduleSaved") });
        setCronInput("");
        setShowScheduleForm(false);
        await load();
      } else {
        const j = await res.json().catch(() => ({})) as { error?: string };
        setScheduleNote({ ok: false, msg: j.error ?? t("wf.detail.cronErr") });
      }
    } catch {
      setScheduleNote({ ok: false, msg: t("wf.detail.cronErr") });
    } finally {
      setSavingSchedule(false);
    }
  }, [workflowId, cronInput, load, t]);

  // ---- Render ----

  if (loading) {
    return (
      <main className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-neutral-400" aria-hidden />
      </main>
    );
  }

  if (loadErr || notFound) {
    return (
      <main className="px-4 pt-6 sm:px-6">
        <p className="text-sm text-neutral-500">
          {notFound ? t("wf.detail.notFound") : t("wf.detail.loadErr")}
        </p>
        <Link href="/workflows" className="mt-3 inline-flex items-center gap-1.5 text-sm text-[var(--color-accent)] hover:underline">
          <ArrowLeft size={13} aria-hidden />
          {t("wf.heading")}
        </Link>
      </main>
    );
  }

  return (
    <main className="w-full px-4 pt-4 pb-24 sm:px-6 sm:pt-6 md:pb-8">
      {/* Back link */}
      <Link
        href="/workflows"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200"
      >
        <ArrowLeft size={13} aria-hidden />
        {t("wf.heading")}
      </Link>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{workflow!.name}</h1>
          {workflow!.description && (
            <p className="mt-1 text-sm text-neutral-500">{workflow!.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleRunNow()}
            disabled={running}
            className={btn("primary")}
          >
            {running ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : (
              <Play size={14} aria-hidden />
            )}
            {t("wf.detail.runNow")}
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={deleting}
            title={t("wf.delete")}
            aria-label={t("wf.delete")}
            className="rounded-lg p-2 text-neutral-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/20 transition disabled:opacity-50"
          >
            {deleting ? (
              <Loader2 size={15} className="animate-spin" aria-hidden />
            ) : (
              <Trash2 size={15} aria-hidden />
            )}
          </button>
        </div>
      </div>

      {/* Run error feedback */}
      {runError && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400">
          <span>{runError}</span>
          <button
            type="button"
            onClick={() => setRunError(null)}
            className="flex-none text-xs text-red-400 underline hover:text-red-600"
          >
            ✕
          </button>
        </div>
      )}

      {/* ---- Run history ---- */}
      <section className="mb-8">
        <h2 className="mb-3 text-base font-bold">{t("wf.detail.runs")}</h2>
        {runs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
            {t("wf.detail.noRuns")}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-xs font-semibold text-neutral-500 dark:border-neutral-800">
                  <th className="w-6 px-3 py-2" />
                  <th className="px-4 py-3 text-left">{t("wf.run.col.trigger")}</th>
                  <th className="px-4 py-3 text-left">{t("wf.run.col.status")}</th>
                  <th className="px-4 py-3 text-left">{t("wf.run.col.started")}</th>
                  <th className="px-4 py-3 text-left">{t("wf.run.col.duration")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {runs.map((run) => (
                  <Fragment key={run.id}>
                    <tr
                      className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                      onClick={() => void toggleRun(run.id)}
                      aria-expanded={expandedRunId === run.id}
                    >
                      <td className="px-3 py-3 text-neutral-400">
                        {expandedRunId === run.id ? (
                          <ChevronDown size={14} aria-hidden />
                        ) : (
                          <ChevronRight size={14} aria-hidden />
                        )}
                      </td>
                      <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300">
                        {run.trigger === "manual" ? t("wf.run.trigger.manual") : t("wf.run.trigger.schedule")}
                      </td>
                      <td className="px-4 py-3">
                        <span className={"rounded-full px-2 py-0.5 text-xs font-bold " + runStatusClass(run.status)}>
                          {t(`wf.runStatus.${run.status}` as Parameters<typeof t>[0]) || run.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-neutral-500">{fmtDate(run.startedAt, lang)}</td>
                      <td className="px-4 py-3 text-neutral-500">
                        {fmtDuration(run.startedAt, run.finishedAt)}
                      </td>
                    </tr>

                    {/* ---- Expanded step log ---- */}
                    {expandedRunId === run.id && (
                      <tr key={`${run.id}-steps`}>
                        <td colSpan={5} className="bg-neutral-50 px-6 py-3 dark:bg-neutral-800/30">
                          {loadingRunId === run.id ? (
                            <div className="flex items-center gap-2 text-sm text-neutral-400">
                              <Loader2 size={13} className="animate-spin" aria-hidden />
                              {t("wf.runStatus.running")}…
                            </div>
                          ) : runDetails[run.id] ? (
                            <RunStepLog
                              steps={runDetails[run.id].steps}
                              liveSteps={activeRunId === run.id ? liveSteps : []}
                              t={t}
                            />
                          ) : null}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---- Schedule section ---- */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold">{t("wf.detail.schedule")}</h2>
          <button
            type="button"
            onClick={() => { setShowScheduleForm((v) => !v); setScheduleNote(null); }}
            className={btn("secondary")}
          >
            <Calendar size={13} className="mr-1" aria-hidden />
            {t("wf.detail.addSchedule")}
          </button>
        </div>

        {/* Schedule form */}
        {showScheduleForm && (
          <div className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-neutral-500">{t("wf.detail.cronLabel")}</span>
              <input
                type="text"
                value={cronInput}
                onChange={(e) => setCronInput(e.target.value)}
                placeholder="0 9 * * 1-5"
                className="w-52 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] dark:border-neutral-700 dark:bg-neutral-950"
                aria-label={t("wf.detail.cronLabel")}
              />
            </label>
            <button
              type="button"
              onClick={() => void handleSaveSchedule()}
              disabled={savingSchedule || !cronInput.trim()}
              className={btn("primary")}
            >
              {savingSchedule ? <Loader2 size={13} className="animate-spin" aria-hidden /> : null}
              {t("wf.detail.cronSave")}
            </button>
            {scheduleNote && (
              <p className={"text-xs " + (scheduleNote.ok ? "text-green-600" : "text-red-500")}>
                {scheduleNote.msg}
              </p>
            )}
          </div>
        )}

        {schedules.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
            {t("wf.detail.noSchedule")}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            {scheduleActionErr && (
              <div className="flex items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400">
                <span>{scheduleActionErr}</span>
                <button type="button" onClick={() => setScheduleActionErr(null)} className="underline">✕</button>
              </div>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-xs font-semibold text-neutral-500 dark:border-neutral-800">
                  <th className="px-4 py-3 text-left">{t("wf.schedule.col.cron")}</th>
                  <th className="px-4 py-3 text-left">{t("wf.schedule.col.tz")}</th>
                  <th className="px-4 py-3 text-left">{t("wf.schedule.col.next")}</th>
                  <th className="px-4 py-3 text-left">{t("wf.schedule.col.enabled")}</th>
                  <th className="px-4 py-3 text-right">{t("wf.col.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {schedules.map((s) => (
                  <tr key={s.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                    <td className="px-4 py-3 font-mono text-xs">
                      {cronEditId === s.id ? (
                        <input
                          autoFocus
                          type="text"
                          value={cronDraft}
                          onChange={(e) => setCronDraft(e.target.value)}
                          onBlur={() => void handleSaveCron(s.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleSaveCron(s.id);
                            if (e.key === "Escape") setCronEditId(null);
                          }}
                          title={t("wf.schedule.editCron")}
                          className="w-32 rounded border border-[var(--color-accent)] bg-transparent px-1 py-0.5 font-mono text-xs focus:outline-none"
                        />
                      ) : (
                        <button
                          type="button"
                          title="Click để sửa"
                          onClick={() => { setCronDraft(s.cron); setCronEditId(s.id); }}
                          className="hover:text-[var(--color-accent)] transition"
                        >
                          {s.cron}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-500">{s.timezone}</td>
                    <td className="px-4 py-3 text-neutral-500">{fmtDate(s.nextRunAt, lang)}</td>
                    <td className="px-4 py-3">
                      <span className={"rounded-full px-2 py-0.5 text-xs font-bold " + (s.enabled ? "bg-green-500/15 text-green-600 dark:text-green-400" : "bg-neutral-100 text-neutral-400 dark:bg-neutral-800")}>
                        {s.enabled ? t("wf.schedule.enabled") : t("wf.schedule.disabled")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => void handleToggleSchedule(s.id, s.enabled)}
                          disabled={togglingId === s.id}
                          title={s.enabled ? t("wf.schedule.disabled") : t("wf.schedule.enabled")}
                          className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 transition disabled:opacity-50"
                          aria-label={s.enabled ? t("wf.schedule.disabled") : t("wf.schedule.enabled")}
                        >
                          {togglingId === s.id
                            ? <Loader2 size={14} className="animate-spin" aria-hidden />
                            : <Power size={14} aria-hidden />}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteSchedule(s.id)}
                          disabled={deletingSchedId === s.id}
                          title={t("wf.schedule.delete")}
                          className="rounded-lg p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/20 transition disabled:opacity-50"
                          aria-label={t("wf.schedule.delete")}
                        >
                          {deletingSchedId === s.id
                            ? <Loader2 size={14} className="animate-spin" aria-hidden />
                            : <Trash2 size={14} aria-hidden />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

// ---- Run step log (sub-component) ----

type LiveStep = { nodeId: string; status: string; seq: number };

function RunStepLog({
  steps,
  liveSteps,
  t,
}: {
  steps: WorkflowRunStep[];
  liveSteps: LiveStep[];
  t: ReturnType<typeof useT>;
}) {
  // Merge live steps over persisted steps (live wins for status).
  const merged = steps.map((s) => {
    const live = liveSteps.find((ls) => ls.nodeId === s.nodeId);
    return live ? { ...s, status: live.status } : s;
  });

  return (
    <ol className="flex flex-col gap-2" aria-label="run steps">
      {merged.map((s) => (
        <StepRow key={s.id} step={s} t={t} />
      ))}
    </ol>
  );
}

function StepRow({
  step,
  t,
}: {
  step: WorkflowRunStep;
  t: ReturnType<typeof useT>;
}) {
  const [open, setOpen] = useState(false);
  const kindLabel = step.kind === "agent" ? t("wf.step.agent") : t("wf.step.connector");
  const statusLabel = t(`wf.step.${step.status}` as Parameters<typeof t>[0]) || step.status;

  return (
    <li className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {stepStatusIcon(step.status)}
        <span className="font-medium">{step.nodeId}</span>
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-500 dark:bg-neutral-800">
          {kindLabel}
        </span>
        <span className="ml-auto text-xs text-neutral-400">{statusLabel}</span>
        {open ? <ChevronDown size={13} className="text-neutral-400" aria-hidden /> : <ChevronRight size={13} className="text-neutral-400" aria-hidden />}
      </button>

      {open && (
        <div className="border-t border-neutral-100 px-3 py-2 dark:border-neutral-700">
          {step.error && (
            <p className="mb-2 rounded bg-red-50 px-2 py-1 text-xs text-red-600 dark:bg-red-950/30 dark:text-red-400">
              {step.error}
            </p>
          )}
          {step.output != null && (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-neutral-50 px-2 py-1.5 text-[11px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              {typeof step.output === "string"
                ? step.output
                : JSON.stringify(step.output, null, 2)}
            </pre>
          )}
          {step.output == null && !step.error && (
            <span className="text-xs text-neutral-400">—</span>
          )}
        </div>
      )}
    </li>
  );
}
