"use client";

import { useT } from "@/i18n/provider";
import { agents } from "@/i18n/dictionaries/agents";
import type { SubAgentJson } from "@/db/schema";

const DOT: Record<string, string> = {
  running: "bg-green-500",
  done: "bg-neutral-400",
};

function dur(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function SubAgentList({ items }: { items: SubAgentJson[] }) {
  const t = useT(agents);
  if (!items.length) return null;
  return (
    <div className="mt-3 border-t border-neutral-100 pt-2 dark:border-neutral-800">
      <p className="mb-1 text-[11px] font-semibold text-neutral-500">
        {t("agents.subs", { n: items.length })}
      </p>
      <ul className="space-y-1">
        {items.map((a) => (
          <li key={a.id} className="flex items-center gap-2 text-[11px] text-neutral-500">
            <span className={"h-1.5 w-1.5 shrink-0 rounded-full " + (DOT[a.status] ?? "bg-amber-500")} />
            <span className="font-mono font-medium text-neutral-700 dark:text-neutral-300">{a.type}</span>
            <span className="truncate">{a.description || t("agents.subNoDesc")}</span>
            <span className="ml-auto shrink-0 tabular-nums">{dur(a.durationMs)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
