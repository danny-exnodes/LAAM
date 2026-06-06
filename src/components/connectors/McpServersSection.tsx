"use client";

// MCP servers — let a user add / list / remove their personal Model Context
// Protocol servers. Self-contained client component rendered on the Connectors
// page. Consumes:
//   GET    /api/connectors/mcp                       → { servers: [...] }
//   POST   /api/connectors/mcp  { name, url, authToken?, trustReadHints? }
//   DELETE /api/connectors/mcp?slug=<slug>           → { ok }
// Visual language (card / input / button classes) mirrors ConnectorsClient.

import { useCallback, useEffect, useState } from "react";
import { Server } from "lucide-react";
import { useT } from "@/i18n/provider";
import { connectors as dict } from "@/i18n/dictionaries/connectors";

type McpServer = {
  slug: string;
  name: string;
  url: string;
  hasToken: boolean;
  trustReadHints: boolean;
  tools: string[];
};

type T = ReturnType<typeof useT>;

// Show the host of a server URL; fall back to the raw string if it won't parse.
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function McpServersSection() {
  const t = useT(dict);
  const [servers, setServers] = useState<McpServer[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/connectors/mcp");
      const data = await res.json().catch(() => ({}));
      setServers((data && data.servers) || []);
    } catch {
      setServers([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="mt-8">
      <div className="mb-3">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <Server className="h-4 w-4 text-[var(--color-accent)]" />
          {t("conn.mcp.heading")}
        </h2>
        <p className="mt-0.5 text-xs text-neutral-500">{t("conn.mcp.sub")}</p>
      </div>

      {servers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
          {t("conn.mcp.none")}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
          {servers.map((s) => (
            <McpCard key={s.slug} s={s} t={t} reload={load} />
          ))}
        </div>
      )}

      <AddMcpForm t={t} reload={load} />
    </section>
  );
}

function McpCard({ s, t, reload }: { s: McpServer; t: T; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);

  const remove = useCallback(async () => {
    setBusy(true);
    try {
      await fetch(`/api/connectors/mcp?slug=${encodeURIComponent(s.slug)}`, { method: "DELETE" });
      await reload();
    } finally {
      setBusy(false);
    }
  }, [s.slug, reload]);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-[var(--color-accent)]/15 text-[var(--color-accent)]">
          <Server className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">{s.name}</div>
          <div className="mt-0.5 truncate text-xs text-neutral-500">{hostOf(s.url)}</div>
        </div>
        {s.trustReadHints && (
          <span className="flex-none rounded-full bg-[var(--color-accent)]/15 px-2.5 py-0.5 text-xs font-bold text-[var(--color-accent)]">
            {t("conn.mcp.trustReads")}
          </span>
        )}
      </div>

      <div className="break-words font-mono text-[11px] leading-snug text-neutral-400">
        {s.tools.length > 0
          ? `${t("conn.mcp.toolsLabel")}: ${s.tools.join(", ")}`
          : t("conn.mcp.noTools")}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void remove()} className={btn("danger")}>
          {t("conn.mcp.remove")}
        </button>
      </div>
    </div>
  );
}

function AddMcpForm({ t, reload }: { t: T; reload: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [trustReadHints, setTrustReadHints] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/connectors/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          url,
          authToken: authToken || undefined,
          trustReadHints,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (j.ok) {
        setName("");
        setUrl("");
        setAuthToken("");
        setTrustReadHints(false);
        await reload();
      } else {
        setErr(j.error || t("conn.mcp.addErr"));
      }
    } catch {
      setErr(t("conn.mcp.addErr"));
    } finally {
      setBusy(false);
    }
  }, [name, url, authToken, trustReadHints, reload, t]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="mt-4 flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="text-sm font-bold">{t("conn.mcp.add")}</div>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-500">{t("conn.mcp.name")}</span>
        <input
          type="text"
          required
          value={name}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setName(e.target.value)}
          className={inputCls}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-500">{t("conn.mcp.url")}</span>
        <input
          type="url"
          required
          value={url}
          autoComplete="off"
          spellCheck={false}
          placeholder="https://…"
          onChange={(e) => setUrl(e.target.value)}
          className={inputCls}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-500">{t("conn.mcp.token")}</span>
        <input
          type="password"
          value={authToken}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setAuthToken(e.target.value)}
          className={inputCls}
        />
      </label>

      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={trustReadHints}
          onChange={(e) => setTrustReadHints(e.target.checked)}
          className="mt-0.5 h-4 w-4 flex-none accent-[var(--color-accent)]"
        />
        <span className="flex flex-col">
          <span className="text-sm">{t("conn.mcp.trustReads")}</span>
          <span className="text-[11px] leading-relaxed text-neutral-400">{t("conn.mcp.trustReadsHint")}</span>
        </span>
      </label>

      {err && <div className="text-xs text-red-500">{err}</div>}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={btn("primary")}>
          {busy ? t("conn.mcp.adding") : t("conn.mcp.add")}
        </button>
      </div>
    </form>
  );
}

const inputCls =
  "w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-sm outline-none focus:border-[var(--color-accent)] dark:border-neutral-700 dark:bg-neutral-950";

function btn(kind: "primary" | "danger") {
  const base =
    "inline-block rounded-lg px-3.5 py-1.5 text-sm font-semibold transition disabled:cursor-default disabled:opacity-50";
  if (kind === "primary") return base + " bg-[var(--color-accent)] text-white hover:opacity-90";
  return (
    base +
    " border border-neutral-200 text-neutral-600 hover:border-red-500 hover:bg-red-500 hover:text-white dark:border-neutral-700 dark:text-neutral-300"
  );
}
