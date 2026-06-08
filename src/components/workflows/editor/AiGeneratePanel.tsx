"use client";

// AiGeneratePanel — describe a workflow in words; the local model drafts a graph
// (#3). POSTs /api/workflows/generate; on success calls onApply(graph) (the editor
// loads it as an undoable proposal). No business logic here beyond the fetch.

import { useState } from "react";
import { Sparkles, Loader2, X } from "lucide-react";
import type { WorkflowGraph } from "@/lib/workflow/types";
import type { Translator } from "@/i18n/types";

export function AiGeneratePanel({
  onApply,
  onClose,
  t,
}: {
  onApply: (graph: WorkflowGraph) => void;
  onClose: () => void;
  t: Translator;
}) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const examples = [t("wf.ai.ex1"), t("wf.ai.ex2")];

  async function generate() {
    const p = prompt.trim();
    if (!p || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/workflows/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: p }),
      });
      const body = (await res.json().catch(() => ({}))) as { graph?: WorkflowGraph; error?: string };
      if (!res.ok || !body.graph) {
        setError(body.error ?? t("wf.ai.error"));
        return;
      }
      onApply(body.graph);
      onClose();
    } catch {
      setError(t("wf.ai.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="absolute inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-16"
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}
      data-testid="ai-generate-panel"
    >
      <div className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-5 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-800 dark:text-neutral-100">
            <Sparkles size={16} className="text-[var(--color-accent)]" aria-hidden /> {t("wf.ai.title")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("wf.cancel")}
            className="rounded p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        <p className="mb-2 text-xs text-neutral-500">{t("wf.ai.hint")}</p>
        <textarea
          autoFocus
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void generate();
          }}
          placeholder={t("wf.ai.placeholder")}
          rows={4}
          aria-label={t("wf.ai.title")}
          className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)] dark:border-neutral-700 dark:bg-neutral-950"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {examples.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setPrompt(ex)}
              className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs text-neutral-500 transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] dark:border-neutral-700"
            >
              {ex}
            </button>
          ))}
        </div>
        {error && (
          <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-600 dark:bg-red-950/30 dark:text-red-400">{error}</p>
        )}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            {t("wf.cancel")}
          </button>
          <button
            type="button"
            onClick={() => void generate()}
            disabled={!prompt.trim() || loading}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}
            {loading ? t("wf.ai.generating") : t("wf.ai.generate")}
          </button>
        </div>
      </div>
    </div>
  );
}
