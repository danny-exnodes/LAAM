"use client";

// In-app notification bell (F2). Fetches the caller's recent notifications + unread
// count, then live-updates the badge by subscribing to the per-user `notification`
// SSE event (/api/events — same stream useLiveSessions uses, but this listens ONLY
// for the `notification` event the server fans out to THIS user). Dropdown lists
// recent items with read/unread styling, deep-links, and mark-all-read.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useT } from "@/i18n/provider";
import { notificationsDict } from "@/i18n/dictionaries/notifications";

export type BellNotification = {
  id: string;
  type: string;
  severity: "info" | "warn" | "error";
  title: string;
  body: string | null;
  link: string | null;
  source: string;
  readAt: string | null;
  createdAt: string;
};

// Pure helpers (exported for unit tests) -----------------------------------

/** Compact relative time using the namespace's localized keys. */
export function relTime(
  iso: string,
  t: (k: string, v?: Record<string, string | number>) => string,
  now = Date.now(),
): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return t("notif.now");
  if (min < 60) return t("notif.minutesAgo", { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t("notif.hoursAgo", { n: hr });
  return t("notif.daysAgo", { n: Math.floor(hr / 24) });
}

/** Badge label: 9+ caps the visible count (full number lives in the aria-label). */
export function badgeLabel(unread: number): string | null {
  if (unread <= 0) return null;
  return unread > 9 ? "9+" : String(unread);
}

const SEVERITY_DOT: Record<string, string> = {
  info: "bg-[var(--color-accent)]",
  warn: "bg-amber-500",
  error: "bg-red-500",
};

export function NotificationBell() {
  const t = useT(notificationsDict);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<BellNotification[]>([]);
  const [unread, setUnread] = useState(0);
  // Track ids already counted from SSE so a list refetch + live event don't double-count.
  const seenRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=20");
      if (!res.ok) return;
      const data = (await res.json()) as { notifications: BellNotification[]; unread: number };
      setItems(data.notifications);
      setUnread(data.unread);
      seenRef.current = new Set(data.notifications.map((n) => n.id));
    } catch {
      // Bell must never break the header — keep prior state on a transient failure.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Live badge: listen for the per-user `notification` SSE event. The server only
  // sends this to the recipient's own clients, so no client-side userId check needed.
  useEffect(() => {
    const es = new EventSource("/api/events");
    es.addEventListener("notification", (e) => {
      let n: BellNotification | undefined;
      try {
        n = JSON.parse((e as MessageEvent).data).notification as BellNotification;
      } catch {
        return;
      }
      if (!n) return;
      setItems((prev) => [n!, ...prev.filter((p) => p.id !== n!.id)].slice(0, 20));
      // Only bump the unread badge for a genuinely-new, still-unread notification.
      if (!seenRef.current.has(n.id) && !n.readAt) {
        seenRef.current.add(n.id);
        setUnread((u) => u + 1);
      }
    });
    return () => es.close();
  }, []);

  const markAllRead = useCallback(async () => {
    setUnread(0);
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    try {
      await fetch("/api/notifications/read-all", { method: "POST" });
    } catch {
      void load(); // resync on failure
    }
  }, [load]);

  const onItemClick = useCallback((id: string) => {
    setOpen(false);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)));
    setUnread((u) => Math.max(0, u - 1));
    void fetch(`/api/notifications/${id}`, { method: "PATCH" }).catch(() => {});
  }, []);

  const badge = badgeLabel(unread);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={badge ? `${t("notif.bell")} — ${t("notif.unreadCount", { n: unread })}` : t("notif.bell")}
        aria-expanded={open}
        className="relative grid h-9 w-9 place-items-center rounded-lg border border-neutral-300 text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
      >
        <Bell size={16} aria-hidden />
        {badge && (
          <span
            data-testid="notif-badge"
            className="absolute -top-1.5 -right-1.5 grid min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white"
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="anim-scale-in absolute top-11 right-0 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">{t("notif.title")}</span>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-xs text-[var(--color-accent)] hover:underline"
                >
                  {t("notif.markAllRead")}
                </button>
              )}
            </div>

            <ul className="max-h-80 overflow-y-auto">
              {items.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-neutral-500">{t("notif.empty")}</li>
              )}
              {items.map((n) => {
                const isUnread = !n.readAt;
                const Row = (
                  <div
                    className={
                      "flex gap-2 px-3 py-2.5 text-left transition hover:bg-neutral-100 dark:hover:bg-neutral-800 " +
                      (isUnread ? "bg-[var(--color-accent)]/5" : "")
                    }
                  >
                    <span
                      className={"mt-1.5 h-2 w-2 shrink-0 rounded-full " + (SEVERITY_DOT[n.severity] ?? SEVERITY_DOT.info)}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div
                        className={
                          "truncate text-sm " +
                          (isUnread
                            ? "font-medium text-neutral-800 dark:text-neutral-100"
                            : "text-neutral-600 dark:text-neutral-400")
                        }
                      >
                        {n.title}
                      </div>
                      {n.body && <div className="truncate text-xs text-neutral-500">{n.body}</div>}
                      <div className="mt-0.5 text-[11px] text-neutral-400">{relTime(n.createdAt, t)}</div>
                    </div>
                  </div>
                );
                return (
                  <li key={n.id}>
                    {n.link ? (
                      <Link href={n.link} onClick={() => onItemClick(n.id)} className="block">
                        {Row}
                      </Link>
                    ) : (
                      <button type="button" onClick={() => onItemClick(n.id)} className="block w-full">
                        {Row}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="border-t border-neutral-200 px-3 py-2 text-center dark:border-neutral-800">
              <Link
                href="/notifications"
                onClick={() => setOpen(false)}
                className="text-xs text-[var(--color-accent)] hover:underline"
              >
                {t("notif.viewAll")}
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
