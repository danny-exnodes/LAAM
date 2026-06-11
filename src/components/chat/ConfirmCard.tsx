"use client";
// SP-2 write-gate: card xác nhận hành động write của agent (vd tạo card Trello).
// title/summary/fields do BACKEND cấp (đã redact + code-built) → hiển thị as-is.
// FE chỉ echo token (mờ) khi confirm; không ký/giải/parse. Slot additive (như
// ToolTrace/Citations) — null khi message không có pendingWrite.
import { Fragment } from "react";
import { useT } from "@/i18n/provider";
import { chat } from "@/i18n/dictionaries/chat";
import type { PendingWrite } from "./types";

export function ConfirmCard({
  pending,
  onConfirm,
}: {
  pending: PendingWrite;
  onConfirm: (approve: boolean) => void;
}) {
  const t = useT(chat);
  const { title, summary, fields, status } = pending;
  const open = status === "idle" || status === "sending";

  return (
    <div
      role="group"
      aria-label={t("chat.confirmAction")}
      className="mt-2 rounded-xl border border-[var(--color-accent)]/40 bg-amber-50/60 p-3 sm:p-4 dark:border-[var(--color-accent)]/30 dark:bg-amber-950/20"
    >
      <div className="font-semibold text-neutral-900 dark:text-neutral-100">{title}</div>
      <div className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">{summary}</div>

      {fields && fields.length > 0 && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          {fields.map((f, i) => (
            <Fragment key={i}>
              <dt className="text-neutral-500 dark:text-neutral-400">{f.label}</dt>
              <dd className="break-words text-neutral-800 dark:text-neutral-200">{f.value}</dd>
            </Fragment>
          ))}
        </dl>
      )}

      {open ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={status === "sending"}
            onClick={() => onConfirm(true)}
            className="rounded-lg bg-[var(--accent-fill)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-default disabled:opacity-50"
          >
            {status === "sending" ? t("chat.confirmSending") : t("chat.confirm")}
          </button>
          <button
            type="button"
            disabled={status === "sending"}
            onClick={() => onConfirm(false)}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:cursor-default disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            {t("chat.cancel")}
          </button>
        </div>
      ) : (
        <div className="mt-3 text-sm font-medium text-neutral-500 dark:text-neutral-400">
          {status === "done"
            ? t("chat.confirmDone")
            : status === "cancelled"
              ? t("chat.confirmCancelled")
              : t("chat.confirmError")}
        </div>
      )}
    </div>
  );
}
