"use client";

// Full /notifications list (F2). Server-rendered initial rows; client handles
// mark-read (scoped API) + mark-all-read. Deep-links navigate via the row link.

import { useCallback, useState } from "react";
import Link from "next/link";
import { Check, CheckCheck } from "lucide-react";
import { useT } from "@/i18n/provider";
import { notificationsDict } from "@/i18n/dictionaries/notifications";
import { relTime, type BellNotification } from "@/components/notification-bell";

const SEVERITY_DOT: Record<string, string> = {
  info: "bg-[var(--color-accent)]",
  warn: "bg-amber-500",
  error: "bg-red-500",
};

export function NotificationsList({ initial }: { initial: BellNotification[] }) {
  const t = useT(notificationsDict);
  const [items, setItems] = useState<BellNotification[]>(initial);
  const unread = items.filter((n) => !n.readAt).length;

  const markRead = useCallback((id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)));
    void fetch(`/api/notifications/${id}`, { method: "PATCH" }).catch(() => {});
  }, []);

  const markAllRead = useCallback(() => {
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    void fetch("/api/notifications/read-all", { method: "POST" }).catch(() => {});
  }, []);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-800 dark:text-neutral-100">{t("notif.title")}</h1>
          {unread > 0 && (
            <p className="text-sm text-neutral-500">{t("notif.unreadCount", { n: unread })}</p>
          )}
        </div>
        {unread > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <CheckCheck size={15} aria-hidden /> {t("notif.markAllRead")}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-neutral-200 bg-white px-4 py-10 text-center text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
          {t("notif.empty")}
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
          {items.map((n) => {
            const isUnread = !n.readAt;
            return (
              <li key={n.id} className={"flex items-start gap-3 px-4 py-3 " + (isUnread ? "bg-[var(--color-accent)]/5" : "")}>
                <span
                  className={"mt-1.5 h-2 w-2 shrink-0 rounded-full " + (SEVERITY_DOT[n.severity] ?? SEVERITY_DOT.info)}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  {n.link ? (
                    <Link href={n.link} onClick={() => markRead(n.id)} className="hover:underline">
                      <span className={isUnread ? "font-medium text-neutral-800 dark:text-neutral-100" : "text-neutral-600 dark:text-neutral-300"}>
                        {n.title}
                      </span>
                    </Link>
                  ) : (
                    <span className={isUnread ? "font-medium text-neutral-800 dark:text-neutral-100" : "text-neutral-600 dark:text-neutral-300"}>
                      {n.title}
                    </span>
                  )}
                  {n.body && <div className="text-sm text-neutral-500">{n.body}</div>}
                  <div className="mt-0.5 text-xs text-neutral-400">{relTime(n.createdAt, t)}</div>
                </div>
                {isUnread && (
                  <button
                    type="button"
                    onClick={() => markRead(n.id)}
                    aria-label={t("notif.markRead")}
                    title={t("notif.markRead")}
                    className="shrink-0 rounded-md p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800"
                  >
                    <Check size={15} aria-hidden />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
