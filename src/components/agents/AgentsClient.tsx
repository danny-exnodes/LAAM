"use client";

// Client-driven Agents list. Subscribes to the live SSE feed, derives filter
// option lists, applies the pure filter, groups by project, and renders the
// grouped cards + filter bar. Port of v1 public/agents.js (the data layer; the
// duration ticker lives per-card in AgentCard).

import { useMemo, useState } from "react";
import { useLiveSessions } from "@/hooks/useLiveSessions";
import { downloadCsv } from "@/lib/export";
import { useT } from "@/i18n/provider";
import { agents } from "@/i18n/dictionaries/agents";
import { FilterBar } from "./FilterBar";
import { AgentCard } from "./AgentCard";
import { AgentDrawer } from "./AgentDrawer";
import {
  applyFilters,
  toCsvRow,
  EMPTY_FILTERS,
  AGENT_CSV_COLUMNS,
  type AgentFilters,
} from "./filters";
import type { LiveSession } from "@/hooks/useLiveSessions";

const OTHER = "Khác";

// Sorted unique non-empty values of a string field across sessions.
function options(list: LiveSession[], pick: (s: LiveSession) => string | null): string[] {
  const set = new Set<string>();
  for (const s of list) {
    const v = pick(s);
    if (v) set.add(v);
  }
  return [...set].sort();
}

export function AgentsClient() {
  const t = useT(agents);
  const { sessions, connected, stuckIds } = useLiveSessions();
  const [filters, setFilters] = useState<AgentFilters>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<LiveSession | null>(null);

  const projects = useMemo(() => options(sessions, (s) => s.projectName), [sessions]);
  const models = useMemo(() => options(sessions, (s) => s.model), [sessions]);
  const branches = useMemo(() => options(sessions, (s) => s.gitBranch), [sessions]);

  const filtered = useMemo(() => applyFilters(sessions, filters), [sessions, filters]);
  const stuckSet = useMemo(() => new Set(stuckIds), [stuckIds]);

  // Group filtered sessions by project; null → "Khác" sinks to the end.
  const groups = useMemo(() => {
    const map = new Map<string, LiveSession[]>();
    for (const s of filtered) {
      const key = s.projectName ?? OTHER;
      let arr = map.get(key);
      if (!arr) {
        arr = [];
        map.set(key, arr);
      }
      arr.push(s);
    }
    return [...map.entries()].sort(([a], [b]) =>
      a === OTHER ? 1 : b === OTHER ? -1 : a.localeCompare(b),
    );
  }, [filtered]);

  const exportCsv = () =>
    downloadCsv("agents.csv", filtered.map(toCsvRow), [...AGENT_CSV_COLUMNS]);

  return (
    <>
      <main className="w-full px-4 pt-4 pb-24 sm:px-6 sm:pt-6 md:pb-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
          Agents
          <span
            title={connected ? "live" : "offline"}
            className={"h-2 w-2 rounded-full " + (connected ? "bg-green-500" : "bg-neutral-400")}
          />
        </h1>
        <span className="text-sm text-neutral-500">
          {t("agents.count", { shown: filtered.length, total: sessions.length })}
        </span>
      </div>

      <FilterBar
        value={filters}
        onChange={setFilters}
        onExport={exportCsv}
        projects={projects}
        models={models}
        branches={branches}
      />

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 p-12 text-center dark:border-neutral-700">
          <p className="font-medium">
            {sessions.length === 0 ? t("agents.emptyNone") : t("agents.emptyMatch")}
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            {sessions.length === 0 ? t("agents.emptyNoneSub") : t("agents.emptyMatchSub")}
          </p>
        </div>
      ) : (
        groups.map(([name, items]) => (
          <section key={name} className="mb-8">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
              {name}
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500 dark:bg-neutral-800">
                {items.length}
              </span>
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {items.map((s) => (
                <AgentCard
                  key={s.id}
                  s={s}
                  stuck={stuckSet.has(s.id)}
                  onSelect={setSelected}
                />
              ))}
            </div>
          </section>
        ))
      )}
      </main>
      <AgentDrawer session={selected} onClose={() => setSelected(null)} />
    </>
  );
}
