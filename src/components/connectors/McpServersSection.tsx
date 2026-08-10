"use client";

// MCP servers — let a user add / list / remove their personal Model Context
// Protocol servers. Self-contained client component rendered on the Connectors
// page. Consumes:
//   GET    /api/connectors/mcp                       → { servers: [...] }
//   POST   /api/connectors/mcp  { name, url, authToken?, trustReadHints? }
//   PATCH  /api/connectors/mcp  { slug, enabledTools: string[] | null }
//   DELETE /api/connectors/mcp?slug=<slug>           → { ok }
// Visual language (card / input / button classes) mirrors ConnectorsClient.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Server } from "lucide-react";
import { useT } from "@/i18n/provider";
import { connectors as dict } from "@/i18n/dictionaries/connectors";

type McpToolDetail = { name: string; nsName: string; description: string; kind: "read" | "write" };

type McpServer = {
  slug: string;
  name: string;
  url: string;
  hasToken: boolean;
  trustReadHints: boolean;
  tools: string[];
  // Optional on the wire: an older/partial response (or a discovery failure) must degrade to
  // "no picker", never crash the card and take the whole server list down with it.
  toolDetails?: McpToolDetail[];
  // Real tool names currently switched ON. The server sends every discovered tool in
  // toolDetails, so the OFF ones stay visible and can be switched back on.
  enabledTools?: string[];
};

type T = ReturnType<typeof useT>;

// Host plus path and query, because per-connection options live in the query string on many
// MCP servers (Supabase takes ?features=…, this project's bridge takes ?row_cap=…). Showing
// only the host hid them completely: a setting was in effect and the page looked unchanged.
// Falls back to the raw string when it will not parse.
function endpointOf(url: string): string {
  try {
    const u = new URL(url);
    return u.host + (u.pathname === "/" ? "" : u.pathname) + u.search;
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
          <div className="mt-0.5 truncate text-xs text-neutral-500" title={s.url}>{endpointOf(s.url)}</div>
        </div>
        {s.trustReadHints && (
          <span className="flex-none rounded-full bg-[var(--color-accent)]/15 px-2.5 py-0.5 text-xs font-bold text-[var(--color-accent)]">
            {t("conn.mcp.trustReads")}
          </span>
        )}
      </div>

      {(s.toolDetails?.length ?? 0) > 0 ? (
        <ToolPicker s={s} t={t} reload={reload} />
      ) : (
        <div className="text-[11px] text-neutral-400">{t("conn.mcp.noTools")}</div>
      )}

      <UrlEditor s={s} t={t} reload={reload} />

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void remove()} className={btn("danger")}>
          {t("conn.mcp.remove")}
        </button>
      </div>
    </div>
  );
}

// Repointing a connector without losing anything. This exists because per-connection options
// are part of the URL on many MCP servers, so "change the URL" is a real setting surface — and
// the alternative (remove, re-add) silently discards which tools were enabled.
function UrlEditor({ s, t, reload }: { s: McpServer; t: T; reload: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(s.url);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = useCallback(async () => {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/connectors/mcp", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: s.slug, url: url.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setErr(data?.error || t("conn.mcp.saveUrlErr"));
        return;
      }
      await reload();
      setOpen(false);
    } catch {
      setErr(t("conn.mcp.saveUrlErr"));
    } finally {
      setBusy(false);
    }
  }, [s.slug, url, reload, t]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-[11px] font-semibold text-[var(--color-accent)] hover:underline"
      >
        {t("conn.mcp.editUrl")}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold text-neutral-500">URL</span>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full rounded-lg border border-neutral-200 bg-transparent px-3 py-1.5 font-mono text-[11px] outline-none focus:border-[var(--color-accent)] dark:border-neutral-700"
        />
      </label>
      <p className="text-[11px] leading-snug text-neutral-500">{t("conn.mcp.urlHint")}</p>
      {err && <p className="text-[11px] text-red-500">{err}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || !url.trim() || url.trim() === s.url}
          onClick={() => void save()}
          className={btn("primary")}
        >
          {busy ? t("conn.mcp.savingTools") : t("conn.mcp.saveUrl")}
        </button>
        <button type="button" onClick={() => { setUrl(s.url); setOpen(false); }} className={btn("danger")}>
          {t("conn.mcp.cancel")}
        </button>
      </div>
    </div>
  );
}

// Per-tool on/off. Every enabled tool is re-sent to the model on EVERY round, so this is a
// real lever on token cost (measured 2026-08-06: one server = 55 tools ≈ 11k tokens/round, of
// which a working session used four) and on how much there is for the model to mis-pick.
//
// The card shows WHICH tools are on, not just how many — the count alone does not tell you
// whether the four left on are the four you need. Picking happens in a modal because a real
// server can advertise 50+ tools with a paragraph of description each; that does not fit in a
// card, and choosing blind (name only) is how you switch off the one thing the demo needed.
function ToolPicker({ s, t, reload }: { s: McpServer; t: T; reload: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const details = useMemo(() => s.toolDetails ?? [], [s.toolDetails]);
  const enabledNames = useMemo(
    () => s.enabledTools ?? details.map((d) => d.name),
    [s.enabledTools, details],
  );

  const shown = enabledNames.slice(0, 6);
  const rest = enabledNames.length - shown.length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-neutral-500">
          {t("conn.mcp.toolsOn", { on: enabledNames.length, total: details.length })}
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-[11px] font-semibold text-[var(--color-accent)] hover:underline"
        >
          {t("conn.mcp.pickTools")}
        </button>
      </div>

      {enabledNames.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {shown.map((n) => (
            <span
              key={n}
              className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
            >
              {n}
            </span>
          ))}
          {rest > 0 && (
            <span className="px-1 py-0.5 text-[10px] text-neutral-400">
              {t("conn.mcp.moreTools", { n: rest })}
            </span>
          )}
        </div>
      )}

      {open && (
        <ToolDialog s={s} t={t} reload={reload} details={details} enabledNames={enabledNames} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

function ToolDialog({
  s,
  t,
  reload,
  details,
  enabledNames,
  onClose,
}: {
  s: McpServer;
  t: T;
  reload: () => Promise<void>;
  details: McpToolDetail[];
  enabledNames: string[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(enabledNames));
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const all = useMemo(() => details.map((d) => d.name), [details]);
  // Compare as SETS, not by length: same size with different members is still a change.
  const dirty = useMemo(
    () => selected.size !== enabledNames.length || enabledNames.some((n) => !selected.has(n)),
    [selected, enabledNames],
  );
  // Filter over name AND description — with 50+ tools "which one reads rows?" is a
  // description question, not a name question.
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return details;
    return details.filter(
      (d) => d.name.toLowerCase().includes(needle) || d.description.toLowerCase().includes(needle),
    );
  }, [details, q]);

  // Esc closes, like every other modal the user has met.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = useCallback((name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const save = useCallback(async () => {
    setBusy(true);
    setErr("");
    try {
      // Everything selected ⇒ store `null` ("all") rather than a frozen list, so a tool the
      // server gains later is on by default — that is what "all" means to the person who
      // ticked every box. A partial selection is stored literally.
      const body = { slug: s.slug, enabledTools: selected.size === all.length ? null : [...selected] };
      const res = await fetch("/api/connectors/mcp", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setErr(data?.error || t("conn.mcp.saveToolsErr"));
        return;
      }
      await reload();
      onClose();
    } catch {
      setErr(t("conn.mcp.saveToolsErr"));
    } finally {
      setBusy(false);
    }
  }, [s.slug, selected, all.length, reload, t, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("conn.mcp.dialogTitle", { name: s.name })}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-bold">{t("conn.mcp.dialogTitle", { name: s.name })}</h3>
            <p className="mt-1 text-[11px] leading-snug text-neutral-500">{t("conn.mcp.pickToolsHint")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("conn.mcp.close")}
            className="flex-none rounded-lg px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("conn.mcp.searchTools")}
            aria-label={t("conn.mcp.searchTools")}
            className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] dark:border-neutral-700"
          />
          <span className="text-[11px] text-neutral-500">
            {t("conn.mcp.toolsOn", { on: selected.size, total: all.length })}
          </span>
          <button
            type="button"
            onClick={() => setSelected(new Set(all))}
            className="text-[11px] font-semibold text-[var(--color-accent)] hover:underline"
          >
            {t("conn.mcp.selectAll")}
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-[11px] font-semibold text-neutral-500 hover:underline"
          >
            {t("conn.mcp.selectNone")}
          </button>
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto pr-1">
          {visible.length === 0 && (
            <li className="py-6 text-center text-xs text-neutral-500">{t("conn.mcp.noMatch")}</li>
          )}
          {visible.map((d) => (
            <li key={d.name} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800">
              <label className="flex cursor-pointer items-start gap-2.5 px-1 py-2 hover:bg-neutral-50 dark:hover:bg-neutral-800/60">
                <input
                  type="checkbox"
                  checked={selected.has(d.name)}
                  onChange={() => toggle(d.name)}
                  className="mt-0.5 h-3.5 w-3.5 flex-none accent-[var(--color-accent)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-mono text-xs font-semibold">{d.name}</span>
                    {d.kind === "write" && (
                      <span className="flex-none rounded bg-amber-500/15 px-1.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                        write
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-neutral-500">
                    {d.description?.trim() || t("conn.mcp.noDesc")}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>

        {selected.size === 0 && (
          <p className="text-[11px] leading-snug text-amber-600 dark:text-amber-400">
            {t("conn.mcp.allOffWarn")}
          </p>
        )}
        {err && <p className="text-[11px] text-red-500">{err}</p>}

        <div className="flex flex-none gap-2">
          <button type="button" disabled={busy || !dirty} onClick={() => void save()} className={btn("primary")}>
            {busy ? t("conn.mcp.savingTools") : t("conn.mcp.saveTools")}
          </button>
          <button type="button" onClick={onClose} className={btn("danger")}>
            {t("conn.mcp.cancel")}
          </button>
        </div>
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
  if (kind === "primary") return base + " bg-[var(--accent-fill)] text-white hover:opacity-90";
  return (
    base +
    " border border-neutral-200 text-neutral-600 hover:border-red-500 hover:bg-red-500 hover:text-white dark:border-neutral-700 dark:text-neutral-300"
  );
}
