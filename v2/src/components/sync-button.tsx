"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export function SyncButton() {
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
        setMsg(data.error ?? "Lỗi đồng bộ");
        return;
      }
      setMsg(`${data.sessions ?? 0} session`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-neutral-500">{msg}</span>}
      <button
        onClick={sync}
        disabled={loading}
        className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        <RefreshCw size={14} className={loading ? "animate-spin" : ""} aria-hidden />
        {loading ? "Đang đồng bộ…" : "Đồng bộ"}
      </button>
    </div>
  );
}
