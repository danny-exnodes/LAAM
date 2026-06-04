"use client";

import { useT } from "@/i18n/provider";
import { agents } from "@/i18n/dictionaries/agents";
import { EMPTY_FILTERS, type AgentFilters } from "./filters";

const SELECT_CLS =
  "rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200";

export function FilterBar({
  value,
  onChange,
  onExport,
  projects,
  models,
  branches,
}: {
  value: AgentFilters;
  onChange: (f: AgentFilters) => void;
  onExport: () => void;
  projects: string[];
  models: string[];
  branches: string[];
}) {
  const t = useT(agents);
  const set = (patch: Partial<AgentFilters>) => onChange({ ...value, ...patch });

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <input
        type="search"
        value={value.q}
        onChange={(e) => set({ q: e.target.value })}
        placeholder={t("agents.searchPh")}
        className={"min-w-[220px] flex-1 " + SELECT_CLS}
      />

      <select aria-label="project-filter" className={SELECT_CLS} value={value.project} onChange={(e) => set({ project: e.target.value })}>
        <option value="">{t("agents.projAll")}</option>
        {projects.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>

      <select aria-label="model-filter" className={SELECT_CLS} value={value.model} onChange={(e) => set({ model: e.target.value })}>
        <option value="">{t("agents.modelAll")}</option>
        {models.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>

      <select aria-label="status-filter" className={SELECT_CLS} value={value.status} onChange={(e) => set({ status: e.target.value })}>
        <option value="">{t("agents.statusAll")}</option>
        <option value="running">running</option>
        <option value="idle">idle</option>
        <option value="done">done</option>
        <option value="stuck">{t("agents.statusStuck")}</option>
      </select>

      <select aria-label="branch-filter" className={SELECT_CLS} value={value.branch} onChange={(e) => set({ branch: e.target.value })}>
        <option value="">{t("agents.branchAll")}</option>
        {branches.map((b) => <option key={b} value={b}>{b}</option>)}
      </select>

      <select aria-label="window-filter" className={SELECT_CLS} value={value.window} onChange={(e) => set({ window: e.target.value })}>
        <option value="">{t("agents.timeAll")}</option>
        <option value="1h">{t("agents.time1h")}</option>
        <option value="6h">{t("agents.time6h")}</option>
        <option value="24h">{t("agents.time24h")}</option>
        <option value="7d">{t("agents.time7d")}</option>
      </select>

      <button
        type="button"
        onClick={() => onChange(EMPTY_FILTERS)}
        className="rounded-lg px-2.5 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
      >
        {t("agents.clear")}
      </button>

      <button
        type="button"
        onClick={onExport}
        title={t("agents.exportTitle")}
        className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-800"
      >
        {t("agents.exportCsv")}
      </button>
    </div>
  );
}
