"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search as SearchIcon } from "lucide-react";
import { useT } from "@/i18n/provider";
import { searchDict } from "@/i18n/dictionaries/search";
import { fmtDateTime } from "@/lib/format";
import type { SearchResults } from "@/lib/search";

const DEBOUNCE_MS = 300;
const MIN_QUERY_LEN = 2; // mirror of lib/search MIN_QUERY_LEN — skip fetches the API would empty-return anyway

function GroupCard({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="border-b border-neutral-100 px-4 py-2.5 dark:border-neutral-800">
        <h2 className="text-sm font-semibold">{title}</h2>
        {note ? <p className="mt-0.5 text-xs text-neutral-500">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Row({ href, primary, secondary, meta }: { href: string; primary: string; secondary?: string | null; meta?: string | null }) {
  return (
    <Link
      href={href}
      className="flex items-baseline justify-between gap-3 px-4 py-2.5 transition hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{primary}</span>
        {secondary ? <span className="block truncate text-xs text-neutral-500">{secondary}</span> : null}
      </span>
      {meta ? <span className="shrink-0 text-xs text-neutral-500">{meta}</span> : null}
    </Link>
  );
}

export function SearchClient() {
  const t = useT(searchDict);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < MIN_QUERY_LEN) {
      setResults(null);
      setLoading(false);
      setErr(false);
      return;
    }
    setLoading(true);
    setErr(false);
    let alive = true;
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => {
          if (!alive) return;
          setResults(d as SearchResults);
          setLoading(false);
        })
        .catch(() => {
          if (!alive) return;
          setErr(true);
          setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q]);

  const isEmpty =
    results !== null &&
    results.sessions.length === 0 &&
    results.conversations.length === 0 &&
    results.workflows.length === 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{t("search.title")}</h1>
        <p className="mt-1 text-sm text-neutral-500">{t("search.subtitle")}</p>
      </div>

      <div className="relative max-w-xl">
        <SearchIcon
          size={16}
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-400"
        />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("search.placeholder")}
          aria-label={t("search.title")}
          autoFocus
          className="w-full rounded-xl border border-neutral-200 bg-white py-2 pr-3 pl-9 text-sm shadow-sm outline-none focus:border-[var(--color-accent)] dark:border-neutral-800 dark:bg-neutral-900"
        />
      </div>

      {q.trim().length < MIN_QUERY_LEN ? (
        <p className="text-sm text-neutral-500">{t("search.hint")}</p>
      ) : err ? (
        <p className="text-sm text-red-600">{t("search.error")}</p>
      ) : loading ? (
        <p className="text-sm text-neutral-500">{t("search.loading")}</p>
      ) : isEmpty ? (
        <p className="text-sm text-neutral-500">{t("search.empty", { q: q.trim() })}</p>
      ) : results !== null ? (
        <div className="space-y-4">
          {results.sessions.length > 0 && (
            <GroupCard title={t("search.group.sessions")}>
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {results.sessions.map((s) => (
                  <Row
                    key={s.id}
                    href={`/agents/${s.id}`}
                    primary={s.latestActivity ?? t("search.session.untitled")}
                    secondary={[s.projectName, s.status].filter(Boolean).join(" · ") || null}
                    meta={s.lastActivity ? fmtDateTime(s.lastActivity) : null}
                  />
                ))}
              </div>
            </GroupCard>
          )}
          {results.conversations.length > 0 && (
            <GroupCard title={t("search.group.conversations")} note={t("search.chatNote")}>
              {/* ChatClient doesn't read a conversation query param yet, so these
                  link to /chat plain — deep-linking is a follow-up there. */}
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {results.conversations.map((c) => (
                  <Row
                    key={c.id}
                    href="/chat"
                    primary={c.title}
                    meta={c.updatedAt ? fmtDateTime(c.updatedAt) : null}
                  />
                ))}
              </div>
            </GroupCard>
          )}
          {results.workflows.length > 0 && (
            <GroupCard title={t("search.group.workflows")}>
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {results.workflows.map((w) => (
                  <Row
                    key={w.id}
                    href={`/workflows/${w.id}`}
                    primary={w.name}
                    secondary={w.status}
                    meta={w.updatedAt ? fmtDateTime(w.updatedAt) : null}
                  />
                ))}
              </div>
            </GroupCard>
          )}
        </div>
      ) : null}
    </div>
  );
}
