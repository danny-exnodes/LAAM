"use client";

// Tables that came from a tool result, rendered under the assistant's message.
//
// WHY this exists: until now the ONLY way a queried row reached a text-chat user was the model
// retyping it in prose. Measured 2026-08-06 on the pharmacy demo, "show every refund processed
// by X" returned 62 rows and the model spent 8,041 characters and 76 seconds copying them out
// — and a row it mistypes is indistinguishable from a row it read. These numbers come from the
// tool result via code (Rule 13), not from the model.
//
// Only BIG results get here (see view.ts worthShowing) — an id-by-name lookup stays prose.
//
// Larvis has its own floating DisplayPanel because there the answer is spoken; here the table
// belongs inline with the message it explains.

import { useState } from "react";
import type { ViewDescriptor } from "@/lib/agent/view";

const PREVIEW_ROWS = 8;
// A joined result can carry 28+ columns. Showing them all makes the reader scroll sideways past
// approving_manager_id / department / discount_override_permission before reaching refund_id and
// the amount. The result declares its own column ORDER (view.ts orderedKeys), and that order puts
// the identifying columns first, so the first few are the useful ones. The rest stay one click
// away — hidden, never dropped: a column silently missing is the failure this panel exists to
// avoid.
const PREVIEW_COLS = 8;

function cell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function ResultTables({ views }: { views: ViewDescriptor[] }) {
  if (!views.length) return null;
  return (
    <div className="mt-3 flex flex-col gap-3">
      {views.map((v, i) => (
        <ResultTable key={`${v.title}-${v.source.type === "tool" ? v.source.at : i}`} v={v} />
      ))}
    </div>
  );
}

function ResultTable({ v }: { v: ViewDescriptor }) {
  const [expanded, setExpanded] = useState(false);
  const [allCols, setAllCols] = useState(false);
  const rows = v.rows ?? [];
  const everyCol = v.columns ?? [];
  const cols = allCols ? everyCol : everyCol.slice(0, PREVIEW_COLS);
  const hiddenCols = everyCol.length - cols.length;
  const shown = expanded ? rows : rows.slice(0, PREVIEW_ROWS);
  const hidden = rows.length - shown.length;

  return (
    <figure className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2 border-b border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900/60">
        <span className="truncate text-xs font-semibold">{v.title}</span>
        <span className="flex items-center gap-2 text-[11px] text-neutral-500">
          {hiddenCols > 0 && (
            <button
              type="button"
              onClick={() => setAllCols(true)}
              className="font-semibold text-[var(--color-accent)] hover:underline"
            >
              +{hiddenCols} cột
            </button>
          )}
          {v.truncated ? `${v.truncated.shown}/${v.truncated.total} dòng` : `${rows.length} dòng`}
        </span>
      </figcaption>

      {/* Wide results scroll inside their own box so the page body never scrolls sideways. */}
      <div className="laam-scroll overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-neutral-800">
              {cols.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={`whitespace-nowrap px-3 py-1.5 font-semibold text-neutral-500 ${
                    c.align === "right" ? "text-right" : "text-left"
                  }`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, ri) => (
              <tr key={ri} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800/60">
                {cols.map((c) => (
                  <td
                    key={c.key}
                    className={`whitespace-nowrap px-3 py-1.5 ${c.align === "right" ? "text-right tabular-nums" : ""}`}
                  >
                    {cell(r[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full border-t border-neutral-200 px-3 py-1.5 text-[11px] font-semibold text-[var(--color-accent)] hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/60"
        >
          Xem thêm {hidden} dòng
        </button>
      )}

      {/* How the tool read the request when it had to interpret it — today, a ranking it
          reversed because the measure is negative for a loss. Shown because the correction is
          only useful if it is VISIBLE: a reader who asked for the other end sees immediately
          that they got this one, instead of trusting a table that looks perfectly plausible. */}
      {v.note && (
        <p className="border-t border-neutral-200 px-3 py-1.5 text-[11px] text-neutral-500 dark:border-neutral-800">
          {v.note}
        </p>
      )}

      {/* Fail loud (Rule 12): the descriptor was capped, so "N dòng" above is not the whole
          answer and the user must be told rather than shown a quietly short table. */}
      {v.truncated && (
        <p className="border-t border-neutral-200 px-3 py-1.5 text-[11px] text-amber-600 dark:border-neutral-800 dark:text-amber-400">
          Bảng đã bị cắt bớt — chỉ hiển thị {v.truncated.shown} trên {v.truncated.total} dòng.
        </p>
      )}
    </figure>
  );
}
