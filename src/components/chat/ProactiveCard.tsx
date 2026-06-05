"use client";

// FEAT-2 — proactive system alert as a distinct, dismissable card (not appended
// to the model's reply). The alert payload is code-derived from agent_session
// (Rule 13) and arrives via the {t:"proactive"} stream frame. Purely
// presentational: data + onDismiss come from ChatClient.

import { AlertTriangle, X } from "lucide-react";
import { useT } from "@/i18n/provider";
import { chat } from "@/i18n/dictionaries/chat";

export type ProactiveAlertView = {
  type: "stuck" | "cost";
  project: string;
  minutesIdle?: number;
  costUsd?: number;
};

export function ProactiveCard({
  alerts,
  onDismiss,
}: {
  alerts: ProactiveAlertView[];
  onDismiss(): void;
}) {
  const t = useT(chat);
  if (!alerts.length) return null;

  return (
    <div
      role="alert"
      className="mx-auto flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{t("chat.proactiveTitle")}</div>
        <ul className="mt-1 space-y-0.5">
          {alerts.map((a, i) => (
            <li key={i} className="truncate">
              {a.type === "stuck"
                ? t("chat.proactiveStuck", { project: a.project, n: a.minutesIdle ?? 0 })
                : t("chat.proactiveCost", { project: a.project, c: (a.costUsd ?? 0).toFixed(2) })}
            </li>
          ))}
        </ul>
        <div className="mt-1 text-[11px] text-amber-700/80 dark:text-amber-300/70">
          {t("chat.proactiveHint")}
        </div>
      </div>
      <button
        type="button"
        aria-label={t("chat.proactiveDismiss")}
        title={t("chat.proactiveDismiss")}
        onClick={onDismiss}
        className="shrink-0 rounded-md p-1 text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/40"
      >
        <X size={15} aria-hidden />
      </button>
    </div>
  );
}
