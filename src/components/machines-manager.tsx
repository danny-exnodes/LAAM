"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fmtDateTime } from "@/lib/format";

type M = {
  id: string;
  name: string;
  hostname: string | null;
  lastSeen: string | null;
  hasToken: boolean;
};

export function MachinesManager({
  initial,
  canManage,
}: {
  initial: M[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ name: string; token: string } | null>(null);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/machines", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error ?? "Lỗi");
        return;
      }
      setIssued({ name: data.name, token: data.token });
      setName("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/machines/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

  return (
    <div className="space-y-5">
      {canManage && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <h3 className="mb-3 text-sm font-bold">Tạo máy mới (cấp token collector)</h3>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tên máy (vd: máy của An)"
              className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] dark:border-neutral-700 dark:bg-neutral-950"
            />
            <button
              onClick={create}
              disabled={busy}
              className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Tạo
            </button>
          </div>
          {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        </div>
      )}

      {issued && (
        <div className="rounded-2xl border border-green-300 bg-green-50 p-5 dark:border-green-800 dark:bg-green-950/40">
          <h3 className="text-sm font-bold text-green-800 dark:text-green-300">
            Token cho “{issued.name}” — chỉ hiện 1 lần, hãy copy ngay:
          </h3>
          <code className="mt-2 block overflow-x-auto rounded-lg bg-neutral-900 px-3 py-2 font-mono text-xs text-green-300">
            {issued.token}
          </code>
          <p className="mt-3 text-xs text-neutral-600 dark:text-neutral-400">
            Chạy collector trên máy đó (trong thư mục gốc dự án):
          </p>
          <code className="mt-1 block overflow-x-auto rounded-lg bg-neutral-900 px-3 py-2 font-mono text-xs text-neutral-200">
            {`LAAM_URL=${origin} LAAM_MACHINE_TOKEN=${issued.token} node collector/laam-collector.mjs`}
          </code>
        </div>
      )}

      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        {initial.length === 0 ? (
          <p className="p-5 text-sm text-neutral-500">Chưa có máy nào.</p>
        ) : (
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {initial.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="font-medium">{m.name}</div>
                  <div className="text-xs text-neutral-500">
                    {m.hostname ? m.hostname + " · " : ""}
                    {m.lastSeen ? "lần cuối " + fmtDateTime(m.lastSeen) : "chưa kết nối"}
                    {" · "}
                    {m.hasToken ? (
                      <span className="text-green-600 dark:text-green-400">token hoạt động</span>
                    ) : (
                      <span className="text-neutral-400">không token (host nội bộ)</span>
                    )}
                  </div>
                </div>
                {canManage && m.hasToken && (
                  <button
                    onClick={() => revoke(m.id)}
                    disabled={busy}
                    className="shrink-0 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-red-950/40"
                  >
                    Thu hồi
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
