"use client";

// AiReviewPanel — sends the CURRENT editor graph to /api/workflows/review and shows
// the model's plain-language review (summary / issues / suggestions). Read-only; part
// of #3's "review" vision. Reuses the shared MarkdownView for rendering.

import { useEffect, useState } from "react";
import { Loader2, X, ClipboardCheck } from "lucide-react";
import type { WorkflowGraph } from "@/lib/workflow/types";
import type { Translator } from "@/i18n/types";
import { MarkdownView } from "@/components/render/MarkdownView";

export function AiReviewPanel({
  graph,
  onClose,
  t,
}: {
  graph: WorkflowGraph;
  onClose: () => void;
  t: Translator;
}) {
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  const [review, setReview] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/workflows/review", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ graph }),
        });
        const body = (await res.json().catch(() => ({}))) as { review?: string; error?: string };
        if (!alive) return;
        if (!res.ok || !body.review) {
          setReview(body.error ?? t("wf.ai.error"));
          setState("error");
          return;
        }
        setReview(body.review);
        setState("done");
      } catch {
        if (alive) {
          setReview(t("wf.ai.error"));
          setState("error");
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [graph, t]);

  return (
    <div
      className="absolute inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-16"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="ai-review-panel"
    >
      <div className="flex max-h-[80%] w-full max-w-lg flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-800 dark:text-neutral-100">
            <ClipboardCheck size={16} className="text-[var(--color-accent)]" aria-hidden /> {t("wf.ai.reviewTitle")}
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
        {state === "loading" ? (
          <div className="flex items-center gap-2 py-6 text-sm text-neutral-400">
            <Loader2 size={14} className="animate-spin" aria-hidden /> {t("wf.ai.reviewing")}
          </div>
        ) : state === "error" ? (
          <p className="rounded bg-red-50 px-2 py-1 text-xs text-red-600 dark:bg-red-950/30 dark:text-red-400">{review}</p>
        ) : (
          <MarkdownView
            source={review}
            className="max-h-[60vh] overflow-y-auto text-sm leading-relaxed text-neutral-700 dark:text-neutral-200"
          />
        )}
      </div>
    </div>
  );
}
