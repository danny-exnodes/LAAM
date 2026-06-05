"use client";
// SP-4: trace tool-call 1 lượt chat (đã gọi tool nào, ✓/✗ + args). Gập, vô hình khi rỗng.
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useT } from "@/i18n/provider";
import { chat } from "@/i18n/dictionaries/chat";
import { toolLabel, type ToolTraceItem } from "./toolLabel";

export function ToolTrace({ items }: { items?: ToolTraceItem[] }) {
  const t = useT(chat);
  const [open, setOpen] = useState(false);
  if (!items || items.length === 0) return null;
  return (
    <div className="mb-1.5 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
      >
        <ChevronRight size={12} aria-hidden className={`transition-transform ${open ? "rotate-90" : ""}`} />
        {t("chat.toolUsed", { n: items.length })}
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5 pl-4">
          {items.map((it) => (
            <li key={it.c} className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-300">
              <span aria-hidden className={it.ok === false ? "text-red-500" : it.done ? "text-green-600" : "text-neutral-400"}>
                {it.done ? (it.ok === false ? "✗" : "✓") : "…"}
              </span>
              <span>{toolLabel(it.name, t)}</span>
              {it.args && <span className="text-neutral-400">({it.args})</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
