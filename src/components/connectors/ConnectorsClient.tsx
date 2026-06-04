"use client";

// Connectors page — list external services, paste credentials (stored server-side,
// encrypted at rest, per-user), connect / disconnect / test. Port of v1
// public/connectors.js. Consumes GET /api/connectors and POST
// /api/connectors/:id/{connect,disconnect,test} (owned by the API package).

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/provider";
import { connectors as dict } from "@/i18n/dictionaries/connectors";
import type { ConnectorListItem } from "@/lib/connectors/types";

export function ConnectorsClient() {
  const t = useT(dict);
  const [list, setList] = useState<ConnectorListItem[]>([]);
  const [loadErr, setLoadErr] = useState(false);

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

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="w-full p-4 sm:p-6">
      <div className="mb-5">
        <h1 className="mb-1 text-xl font-bold tracking-tight">{t("conn.heading")}</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-neutral-500">{t("conn.sub")}</p>
      </div>

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
    </main>
  );
}

type T = ReturnType<typeof useT>;
type Note = { ok: boolean; msg: string } | null;

function ConnectorCard({ c, t, reload }: { c: ConnectorListItem; t: T; reload: () => Promise<void> }) {
  const auth = c.auth;
  const fieldsRef = useRef<Record<string, string>>({});
  const [note, setNote] = useState<Note>(null);

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
        if (ok) {
          setNote({ ok: true, msg: j.info || t("conn.testOk") });
          if (reloadAfter) setTimeout(() => void reload(), 600);
        } else {
          setNote({ ok: false, msg: j.error || t("conn.testErr") });
          if (reloadAfter) setTimeout(() => void reload(), 900);
        }
      } catch {
        setNote({ ok: false, msg: t("conn.testErr") });
      }
    },
    [post, reload, t],
  );

  const connect = useCallback(async () => {
    setNote({ ok: true, msg: t("conn.saving") });
    try {
      const { ok, j } = await post("connect");
      if (ok) {
        void runTest(true);
      } else {
        setNote({ ok: false, msg: j.error || t("conn.saveErr") });
      }
    } catch {
      setNote({ ok: false, msg: t("conn.saveErr") });
    }
  }, [post, runTest, t]);

  const disconnect = useCallback(async () => {
    try {
      await post("disconnect");
      await reload();
    } catch {
      setNote({ ok: false, msg: t("conn.saveErr") });
    }
  }, [post, reload, t]);

  const connectLabel =
    auth.type === "token" ? t("conn.connect") : auth.type === "oauth" ? t("conn.oauthNeeded") : t("conn.enable");

  return (
    <div
      className={
        "flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm dark:bg-neutral-900 " +
        (c.connected
          ? "border-green-500/60"
          : "border-neutral-200 dark:border-neutral-800")
      }
    >
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-[var(--color-accent)]/15 text-sm font-bold uppercase text-[var(--color-accent)]">
          {(c.icon || c.name || "?").slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">{c.name}</div>
          {c.blurb && <div className="mt-0.5 text-xs text-neutral-500">{c.blurb}</div>}
        </div>
        <span
          className={
            "flex-none rounded-full px-2.5 py-0.5 text-xs font-bold " +
            (c.connected
              ? "bg-green-500/15 text-green-600 dark:text-green-400"
              : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800")
          }
        >
          {c.connected ? t("conn.connected") : t("conn.notConnected")}
        </span>
      </div>

      {c.tools.length > 0 && (
        <div className="break-words font-mono text-[11px] leading-snug text-neutral-400">
          {t("conn.toolsLabel")}: {c.tools.join(", ")}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {auth.type === "token" &&
          auth.fields.map((f) => (
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
        {auth.type === "token" && auth.help && (
          <div className="text-[11px] leading-relaxed text-neutral-400">{auth.help}</div>
        )}
        {auth.type === "oauth" && (
          <div className="text-[11px] leading-relaxed text-amber-600 dark:text-amber-500">
            {auth.setup || t("conn.oauthNeeded")}
          </div>
        )}
        {auth.type === "none" && auth.help && (
          <div className="text-[11px] leading-relaxed text-neutral-400">{auth.help}</div>
        )}
      </div>

      {note && (
        <div className={"text-xs " + (note.ok ? "text-green-600 dark:text-green-400" : "text-red-500")}>
          {note.msg}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {c.connected ? (
          <>
            <button type="button" onClick={() => void runTest()} className={btn("secondary")}>
              {t("conn.test")}
            </button>
            <button type="button" onClick={() => void disconnect()} className={btn("danger")}>
              {t("conn.disconnect")}
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={auth.type === "oauth"}
            onClick={() => void connect()}
            className={btn(auth.type === "oauth" ? "disabled" : "primary")}
          >
            {connectLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function btn(kind: "primary" | "secondary" | "danger" | "disabled") {
  const base =
    "rounded-lg px-3.5 py-1.5 text-sm font-semibold transition disabled:cursor-default disabled:opacity-50";
  if (kind === "primary")
    return base + " bg-[var(--color-accent)] text-white hover:opacity-90";
  if (kind === "danger")
    return (
      base +
      " border border-neutral-200 text-neutral-600 hover:border-red-500 hover:bg-red-500 hover:text-white dark:border-neutral-700 dark:text-neutral-300"
    );
  if (kind === "disabled")
    return base + " bg-[var(--color-accent)] text-white";
  return (
    base +
    " border border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
  );
}
