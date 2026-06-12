"use client";

// Connectors page — list external services, connect / disconnect / test.
// Token connectors take pasted credentials (stored server-side, encrypted, per-user);
// OAuth connectors (Google/Atlassian/Slack/Zalo) use the in-app redirect flow via
// GET /api/connectors/:id/authorize → /api/connectors/:provider/callback; trello
// has a token-mode authorize accelerator (fragment capture). The authorize button
// renders only when auth.oauthConfigured (operator env present) — otherwise the
// card falls back to manual fields (when declared) plus the operator setup hint.
// Consumes GET /api/connectors and POST /api/connectors/:id/{connect,disconnect,test}.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Database,
  GitBranch,
  ClipboardList,
  List,
  Folder,
  Clock,
  MessageSquare,
  Plug,
  type LucideIcon,
} from "lucide-react";
import { useT } from "@/i18n/provider";
import { connectors as dict } from "@/i18n/dictionaries/connectors";
import { PageHeader } from "@/components/page-header";
import { McpServersSection } from "@/components/connectors/McpServersSection";
import type { ConnectorListItem } from "@/lib/connectors/types";

// Connector icon name (kebab-case) → Lucide component. Static map (no dynamic
// import): matches the codebase's named-import convention and avoids a load flash.
const ICONS: Record<string, LucideIcon> = {
  database: Database,
  "git-branch": GitBranch,
  "clipboard-list": ClipboardList,
  list: List,
  folder: Folder,
  clock: Clock,
  "message-square": MessageSquare,
  plug: Plug,
};

// OAuth callback ?error= codes → i18n keys.
const ERR_KEY: Record<string, string> = {
  oauth_not_configured: "conn.errNotConfigured",
  oauth_denied: "conn.errDenied",
  oauth_state: "conn.errState",
  oauth_expired: "conn.errExpired",
  oauth_exchange: "conn.errExchange",
};

type Note = { ok: boolean; msg: string } | null;
type T = ReturnType<typeof useT>;

export function ConnectorsClient() {
  const t = useT(dict);
  const [list, setList] = useState<ConnectorListItem[]>([]);
  const [loadErr, setLoadErr] = useState(false);
  const [banner, setBanner] = useState<Note>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/connectors");
      const data = await res.json();
      setList((data && data.connectors) || []);
      setLoadErr(false);
    } catch {
      setLoadErr(true);
    }
  }, []);

  // Read the OAuth callback result (?connected= / ?error=) once on mount, show a
  // banner, then strip the query so a refresh doesn't repeat it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected) setBanner({ ok: true, msg: t("conn.connectedOk") });
    else if (error) setBanner({ ok: false, msg: t(ERR_KEY[error] ?? "conn.errState") });
    if (connected || error) window.history.replaceState(null, "", "/connectors");
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  return (
    <main className="w-full px-4 pt-4 pb-24 sm:px-6 sm:pt-6 md:pb-8">
      <PageHeader title={t("conn.heading")} subtitle={t("conn.sub")} />

      {banner && (
        <div
          className={
            "mb-4 rounded-xl border px-4 py-2.5 text-sm " +
            (banner.ok
              ? "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400"
              : "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400")
          }
        >
          {banner.msg}
        </div>
      )}

      {loadErr ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 p-12 text-center text-neutral-500 dark:border-neutral-700">
          {t("conn.loadErr")}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
          {list.map((c) => (
            <ConnectorCard key={c.id} c={c} t={t} reload={load} />
          ))}
        </div>
      )}

      <McpServersSection />
    </main>
  );
}

// Resolve a connector-supplied string (blurb / token help / oauth setup) via the
// i18n dict, keyed by connector id, falling back to the connector-provided string
// when no key exists. `t` returns the key itself on a miss (see i18n/index.ts), so
// the `v === k` guard detects an absent key.
function svc(t: T, id: string, field: string, fallback: string): string {
  const k = `conn.svc.${id}.${field}`;
  const v = t(k);
  return v === k ? fallback : v;
}

function ConnectorCard({ c, t, reload }: { c: ConnectorListItem; t: T; reload: () => Promise<void> }) {
  const auth = c.auth;
  const fieldsRef = useRef<Record<string, string>>({});
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState(false);

  const post = useCallback(
    async (action: string) => {
      const res = await fetch(`/api/connectors/${encodeURIComponent(c.id)}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fields: fieldsRef.current }),
      });
      const j = await res.json().catch(() => ({}));
      return { ok: res.ok && j.error == null, j: j as { error?: string; info?: string } };
    },
    [c.id],
  );

  const runTest = useCallback(
    async (reloadAfter = false) => {
      setNote({ ok: true, msg: t("conn.testing") });
      try {
        const { ok, j } = await post("test");
        setNote(
          ok ? { ok: true, msg: j.info || t("conn.testOk") } : { ok: false, msg: j.error || t("conn.testErr") },
        );
        if (reloadAfter) setTimeout(() => void reload(), ok ? 600 : 900);
      } catch {
        setNote({ ok: false, msg: t("conn.testErr") });
      }
    },
    [post, reload, t],
  );

  const connect = useCallback(async () => {
    setBusy(true);
    setNote({ ok: true, msg: t("conn.saving") });
    try {
      const { ok, j } = await post("connect");
      if (ok) await runTest(true);
      else setNote({ ok: false, msg: j.error || t("conn.saveErr") });
    } catch {
      setNote({ ok: false, msg: t("conn.saveErr") });
    } finally {
      setBusy(false);
    }
  }, [post, runTest, t]);

  const test = useCallback(async () => {
    setBusy(true);
    try {
      await runTest();
    } finally {
      setBusy(false);
    }
  }, [runTest]);

  const disconnect = useCallback(async () => {
    setBusy(true);
    try {
      const { ok, j } = await post("disconnect");
      if (ok) setNote(null);
      else setNote({ ok: false, msg: j.error || t("conn.saveErr") });
      await reload();
    } catch {
      setNote({ ok: false, msg: t("conn.saveErr") });
    } finally {
      setBusy(false);
    }
  }, [post, reload, t]);

  const Icon = ICONS[c.icon] ?? Plug;
  const isOauth = auth.type === "oauth";
  const authorizeHref = `/api/connectors/${encodeURIComponent(c.id)}/authorize`;
  const authorizeReady = auth.oauthConfigured;
  // Consent-screen brand: every Google connector consents at Google; the rest
  // consent at the service itself, so the connector name reads naturally.
  const connectLabel = t("conn.connectWith", { name: auth.provider === "google" ? "Google" : c.name });

  const border =
    c.status === "connected"
      ? "border-green-500/60"
      : c.status === "needs_reconnect"
        ? "border-amber-500/60"
        : "border-neutral-200 dark:border-neutral-800";

  const badge =
    c.status === "connected"
      ? { cls: "bg-green-500/15 text-green-600 dark:text-green-400", label: t("conn.connected") }
      : c.status === "needs_reconnect"
        ? { cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400", label: t("conn.needsReconnect") }
        : { cls: "bg-neutral-100 text-neutral-500 dark:bg-neutral-800", label: t("conn.notConnected") };

  return (
    <div
      className={"flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm dark:bg-neutral-900 " + border}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-[var(--color-accent)]/15 text-[var(--color-accent)]">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">{c.name}</div>
          {c.blurb && <div className="mt-0.5 text-xs text-neutral-500">{svc(t, c.id, "blurb", c.blurb)}</div>}
          {c.status === "connected" && c.account && (
            <div className="mt-0.5 truncate text-xs text-neutral-400">
              {t("conn.account")}: {c.account}
            </div>
          )}
        </div>
        <span className={"flex-none rounded-full px-2.5 py-0.5 text-xs font-bold " + badge.cls}>
          {badge.label}
        </span>
      </div>

      {c.tools.length > 0 && (
        <div className="break-words font-mono text-[11px] leading-snug text-neutral-400">
          {t("conn.toolsLabel")}: {c.tools.map((tl) => tl.name).join(", ")}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {auth.type === "token" && <FieldInputs fields={auth.fields} fieldsRef={fieldsRef} />}
        {auth.type === "token" && auth.help && (
          <div className="text-[11px] leading-relaxed text-neutral-400">{svc(t, c.id, "help", auth.help)}</div>
        )}
        {/* OAuth not configured by the operator → show the setup hint; dual-mode
            connectors (jira) additionally expose their manual fields directly. */}
        {isOauth && !authorizeReady && (
          <div className="text-[11px] leading-relaxed text-neutral-500">
            {svc(t, c.id, "setup", auth.setup || t("conn.oauthNeeded"))}
          </div>
        )}
        {isOauth && !authorizeReady && auth.fields.length > 0 && (
          <>
            <FieldInputs fields={auth.fields} fieldsRef={fieldsRef} />
            {auth.help && (
              <div className="text-[11px] leading-relaxed text-neutral-400">{svc(t, c.id, "help", auth.help)}</div>
            )}
          </>
        )}
        {/* OAuth configured + dual-mode → manual entry stays available behind an expander. */}
        {isOauth && authorizeReady && auth.fields.length > 0 && (
          <details className="rounded-lg border border-neutral-200 px-2.5 py-1.5 dark:border-neutral-700">
            <summary className="cursor-pointer text-xs text-neutral-500">{t("conn.manualOption")}</summary>
            <div className="mt-2 flex flex-col gap-2">
              <FieldInputs fields={auth.fields} fieldsRef={fieldsRef} />
              {auth.help && (
                <div className="text-[11px] leading-relaxed text-neutral-400">{svc(t, c.id, "help", auth.help)}</div>
              )}
              <button type="button" disabled={busy} onClick={() => void connect()} className={btn("secondary")}>
                {t("conn.connect")}
              </button>
            </div>
          </details>
        )}
        {auth.type === "none" && auth.help && (
          <div className="text-[11px] leading-relaxed text-neutral-400">{svc(t, c.id, "help", auth.help)}</div>
        )}
      </div>

      {note && (
        <div className={"text-xs " + (note.ok ? "text-green-600 dark:text-green-400" : "text-red-500")}>
          {note.msg}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {c.status === "connected" ? (
          <>
            <button type="button" disabled={busy} onClick={() => void test()} className={btn("secondary")}>
              {t("conn.test")}
            </button>
            <button type="button" disabled={busy} onClick={() => void disconnect()} className={btn("danger")}>
              {t("conn.disconnect")}
            </button>
          </>
        ) : (
          <>
            {authorizeReady && (
              <a href={authorizeHref} className={btn("primary")}>
                {c.status === "needs_reconnect" ? t("conn.reconnect") : connectLabel}
              </a>
            )}
            {/* Manual connect: token connectors always; dual-mode oauth (jira)
                only when the operator env is absent (otherwise it lives in the
                expander above). `none` (demo) keeps its explicit enable. */}
            {auth.type === "token" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void connect()}
                className={btn(authorizeReady ? "secondary" : "primary")}
              >
                {t("conn.connect")}
              </button>
            )}
            {isOauth && !authorizeReady && auth.fields.length > 0 && (
              <button type="button" disabled={busy} onClick={() => void connect()} className={btn("primary")}>
                {t("conn.connect")}
              </button>
            )}
            {auth.type === "none" && (
              <button type="button" disabled={busy} onClick={() => void connect()} className={btn("primary")}>
                {t("conn.enable")}
              </button>
            )}
            {c.status === "needs_reconnect" && (
              <button type="button" disabled={busy} onClick={() => void disconnect()} className={btn("danger")}>
                {t("conn.disconnect")}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Shared credential inputs (token connectors + the dual-mode manual fallback).
// Values go into the parent's fieldsRef so connect() reads one place.
function FieldInputs({
  fields,
  fieldsRef,
}: {
  fields: ConnectorListItem["auth"]["fields"];
  fieldsRef: React.MutableRefObject<Record<string, string>>;
}) {
  return (
    <>
      {fields.map((f) => (
        <label key={f.key} className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500">{f.label}</span>
          <input
            type={f.secret ? "password" : "text"}
            autoComplete="off"
            spellCheck={false}
            placeholder={f.set ? f.masked || "••••" : f.placeholder}
            onChange={(e) => {
              fieldsRef.current[f.key] = e.target.value;
            }}
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-sm outline-none focus:border-[var(--color-accent)] dark:border-neutral-700 dark:bg-neutral-950"
          />
        </label>
      ))}
    </>
  );
}

function btn(kind: "primary" | "secondary" | "danger") {
  const base =
    "inline-block rounded-lg px-3.5 py-1.5 text-sm font-semibold transition disabled:cursor-default disabled:opacity-50";
  if (kind === "primary") return base + " bg-[var(--accent-fill)] text-white hover:opacity-90";
  if (kind === "danger")
    return (
      base +
      " border border-neutral-200 text-neutral-600 hover:border-red-500 hover:bg-red-500 hover:text-white dark:border-neutral-700 dark:text-neutral-300"
    );
  return (
    base +
    " border border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
  );
}
