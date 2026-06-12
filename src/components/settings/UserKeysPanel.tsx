"use client";

import { useEffect, useState } from "react";
import { fmtDateTime } from "@/lib/format";
import { useT } from "@/i18n/provider";
import { usersDict } from "@/i18n/dictionaries/users";

type Token = {
  id: string;
  kind: "api" | "mcp";
  name: string;
  prefix: string;
  last4: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string | null;
  createdByUserId: string | null;
};

// Per-user access keys, shown inside a UsersManager row when expanded. An owner/admin
// can SEE a target user's api/mcp keys and PROVISION a new one for them (POST with
// forUserId). The reveal-once card here is visually distinct from the self-service
// green card so the admin never confuses "my key" with "a key I made for someone".
//
// On the admin's OWN row we don't provision (that's self-service) — we just point them
// to /settings/access. `nameById` maps a key's createdByUserId to the admin's name.
export function UserKeysPanel({
  userId,
  userName,
  isSelf,
  nameById,
}: {
  userId: string;
  userName: string;
  isSelf: boolean;
  nameById: Record<string, string>;
}) {
  const t = useT(usersDict);
  const [tokens, setTokens] = useState<Token[] | null>(null); // null = loading
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"api" | "mcp">("api");
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ name: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    const res = await fetch(`/api/access-tokens?userId=${encodeURIComponent(userId)}`);
    if (res.ok) {
      const data = await res.json();
      setTokens(data.tokens ?? []);
    } else {
      setTokens([]);
      setErr(t("users.err.generic"));
    }
  }

  useEffect(() => {
    if (!isSelf) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function provision() {
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/access-tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), kind, forUserId: userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error ?? t("users.err.generic"));
        return;
      }
      setIssued({ name: name.trim(), token: data.token });
      setName("");
      setCopied(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (typeof window !== "undefined" && !window.confirm(t("users.keys.confirmRevokeOther", { name: userName }))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/access-tokens/${id}`, { method: "DELETE" });
      if (res.ok) await load();
      else {
        const data = await res.json().catch(() => ({}));
        setErr(data.error ?? t("users.err.generic"));
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

  if (isSelf) {
    return (
      <div className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-500 dark:bg-neutral-950">
        {t("users.keys.selfHint")}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg bg-neutral-50 p-3 dark:bg-neutral-950">
      {/* provision form + honest warning */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("users.keys.namePh")}
            className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] dark:border-neutral-700 dark:bg-neutral-900"
          />
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as "api" | "mcp")}
            aria-label={t("users.keys.col.kind")}
            className="rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="api">API</option>
            <option value="mcp">MCP</option>
          </select>
          <button
            onClick={provision}
            disabled={busy}
            className="rounded-lg bg-[var(--accent-fill)] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {t("users.keys.provision")}
          </button>
        </div>
        <p className="text-xs text-amber-700 dark:text-amber-400">{t("users.keys.warning", { name: userName })}</p>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>

      {/* reveal-once — amber, deliberately NOT the self-service green card */}
      {issued && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
          <h4 className="text-xs font-bold text-amber-800 dark:text-amber-300">
            {t("users.keys.modalTitle", { name: issued.name })}
          </h4>
          <div className="mt-2 flex items-center gap-2">
            <code className="block flex-1 overflow-x-auto rounded bg-neutral-900 px-3 py-2 font-mono text-xs text-amber-200">
              {issued.token}
            </code>
            <button
              onClick={copy}
              className="shrink-0 rounded-lg border border-amber-400 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40"
            >
              {copied ? t("users.keys.copied") : t("users.keys.copy")}
            </button>
          </div>
        </div>
      )}

      {/* the target user's existing api/mcp keys */}
      {tokens === null ? (
        <p className="text-xs text-neutral-500">{t("users.keys.loading")}</p>
      ) : tokens.length === 0 ? (
        <p className="text-xs text-neutral-500">{t("users.keys.empty")}</p>
      ) : (
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {tokens.map((tok) => {
            const revoked = !!tok.revokedAt;
            const by = tok.createdByUserId ? nameById[tok.createdByUserId] ?? tok.createdByUserId : null;
            return (
              <li key={tok.id} className={"flex items-center gap-3 py-2 text-sm " + (revoked ? "opacity-50" : "")}>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-neutral-800 dark:text-neutral-100">{tok.name}</div>
                  <div className="text-xs text-neutral-500">
                    <span className="uppercase">{tok.kind}</span>
                    {" · "}
                    {tok.lastUsedAt ? fmtDateTime(tok.lastUsedAt) : t("users.keys.never")}
                    {by && <span> · {t("users.keys.provisionedBy", { admin: by })}</span>}
                  </div>
                </div>
                {!revoked && (
                  <button
                    onClick={() => revoke(tok.id)}
                    disabled={busy}
                    className="shrink-0 rounded-lg border border-neutral-300 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-red-950/40"
                  >
                    {t("users.keys.revoke")}
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
