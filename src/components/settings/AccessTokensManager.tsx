"use client";

import { useState } from "react";
import { fmtDateTime } from "@/lib/format";
import { useT } from "@/i18n/provider";
import { accessDict } from "@/i18n/dictionaries/access";

type Token = {
  id: string;
  kind: "api" | "mcp";
  name: string;
  prefix: string;
  last4: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string | null;
};

export function AccessTokensManager({ initial }: { initial: Token[] }) {
  const t = useT(accessDict);
  const [tokens, setTokens] = useState<Token[]>(initial);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"api" | "mcp">("api");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ name: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function reload() {
    const res = await fetch("/api/access-tokens");
    if (res.ok) {
      const data = await res.json();
      setTokens(data.tokens ?? []);
    }
  }

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/access-tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), kind }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error ?? t("access.err.generic"));
        return;
      }
      setIssued({ name: name.trim(), token: data.token });
      setName("");
      setCopied(false);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (typeof window !== "undefined" && !window.confirm(t("access.confirmRevoke"))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/access-tokens/${id}`, { method: "DELETE" });
      if (res.ok) await reload();
      else {
        const data = await res.json().catch(() => ({}));
        setErr(data.error ?? t("access.err.generic"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the token is visible to copy manually */
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("access.namePh")}
            className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] dark:border-neutral-700 dark:bg-neutral-950"
          />
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as "api" | "mcp")}
            aria-label={t("access.kind")}
            className="rounded-lg border border-neutral-300 bg-white px-2 py-2 text-sm outline-none focus:border-[var(--color-accent)] dark:border-neutral-700 dark:bg-neutral-950"
          >
            <option value="api">{t("access.kind.api")}</option>
            <option value="mcp">{t("access.kind.mcp")}</option>
          </select>
          <button
            onClick={create}
            disabled={busy}
            className="rounded-lg bg-[var(--accent-fill)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {t("access.create")}
          </button>
        </div>
        <p className="mt-2 text-xs text-neutral-500">{t("access.scopeNote")}</p>
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      </div>

      {issued && (
        <div className="rounded-2xl border border-green-300 bg-green-50 p-5 dark:border-green-800 dark:bg-green-950/40">
          <h3 className="text-sm font-bold text-green-800 dark:text-green-300">
            {t("access.issued", { name: issued.name })}
          </h3>
          <div className="mt-2 flex items-center gap-2">
            <code className="block flex-1 overflow-x-auto rounded-lg bg-neutral-900 px-3 py-2 font-mono text-xs text-green-300">
              {issued.token}
            </code>
            <button
              onClick={copy}
              className="shrink-0 rounded-lg border border-green-400 px-3 py-2 text-xs font-medium text-green-700 hover:bg-green-100 dark:text-green-300 dark:hover:bg-green-900/40"
            >
              {copied ? t("access.copied") : t("access.copy")}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        {tokens.length === 0 ? (
          <p className="p-5 text-sm text-neutral-500">{t("access.empty")}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-100 text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
                <th className="px-4 py-3 font-semibold">{t("access.col.token")}</th>
                <th className="px-4 py-3 font-semibold">{t("access.col.kind")}</th>
                <th className="px-4 py-3 font-semibold">{t("access.col.lastUsed")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {tokens.map((tok) => {
                const revoked = !!tok.revokedAt;
                return (
                  <tr key={tok.id} className={revoked ? "opacity-50" : undefined}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-neutral-800 dark:text-neutral-100">{tok.name}</div>
                      <code className="text-xs text-neutral-500">
                        {tok.prefix}•••{tok.last4}
                      </code>
                    </td>
                    <td className="px-4 py-3 uppercase text-xs text-neutral-500">{tok.kind}</td>
                    <td className="px-4 py-3 text-xs text-neutral-500">
                      {tok.lastUsedAt ? fmtDateTime(tok.lastUsedAt) : t("access.never")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {revoked ? (
                        <span className="text-xs text-neutral-400">{t("access.revoked")}</span>
                      ) : (
                        <button
                          onClick={() => revoke(tok.id)}
                          disabled={busy}
                          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-red-950/40"
                        >
                          {t("access.revoke")}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
