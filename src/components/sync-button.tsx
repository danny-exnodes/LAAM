"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { useT } from "@/i18n/provider";
import { common } from "@/i18n/dictionaries/common";

// Icon-only sync action (matches the header's icon row). Spins while syncing;
// the result count / error surfaces via the tooltip.
export function SyncButton() {
  const t = useT(common);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function sync() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        setMsg(data.error ?? t("sync.error"));
        return;
      }
      setMsg(t("sync.result", { n: data.sessions ?? 0 }));
      router.refresh();
      setTimeout(() => setMsg(null), 3000);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={sync}
      disabled={loading}
      aria-label={t("sync.label")}
      title={msg ?? t("sync.title")}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-neutral-300 text-neutral-600 transition hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
    >
      <RefreshCw size={16} className={loading ? "animate-spin" : ""} aria-hidden />
    </button>
  );
}
