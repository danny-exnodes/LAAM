"use client";

// Cmd/Ctrl+K quick-add palette — a keyboard-first overlay to insert a node
// without reaching for the mouse. Reuses NODE_TYPES (the single source of truth
// in NodesLibraryPanel) and the existing addNode path; matching lives in the
// pure, diacritic-folding nodeSearch module. No external dependency (no cmdk).

import { useEffect, useMemo, useRef, useState } from "react";
import type { WfNodeKind } from "@/lib/workflow/types";
import type { Translator } from "@/i18n/types";
import { NODE_TYPES } from "./NodesLibraryPanel";
import { filterKinds } from "./nodeSearch";

export function NodePalette({
  t,
  onPick,
  onClose,
}: {
  t: Translator;
  onPick: (kind: WfNodeKind) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const labelOf = (kind: WfNodeKind) => `${t(`wf.lib.${kind}.name`)} ${t(`wf.lib.${kind}.desc`)}`;
  const kinds = useMemo(
    () => filterKinds(query, NODE_TYPES.map((n) => n.kind), labelOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query],
  );
  const meta = (kind: WfNodeKind) => NODE_TYPES.find((n) => n.kind === kind)!;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  // Keep the active index within the filtered range as the query narrows.
  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, kinds.length - 1)));
  }, [kinds.length]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (kinds.length ? (a + 1) % kinds.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (kinds.length ? (a - 1 + kinds.length) % kinds.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const kind = kinds[active];
      if (kind) {
        onPick(kind);
        onClose();
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[12vh]"
      onClick={onClose}
      data-testid="node-palette"
    >
      <div
        className="w-[min(92vw,28rem)] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-neutral-100 px-3 py-2 dark:border-neutral-800">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t("wf.palette.search")}
            aria-label={t("wf.palette.title")}
            className="w-full bg-transparent text-sm outline-none placeholder:text-neutral-400"
          />
        </div>
        <ul className="max-h-72 overflow-y-auto py-1">
          {kinds.length === 0 && (
            <li className="px-3 py-3 text-center text-xs text-neutral-400">{t("wf.palette.empty")}</li>
          )}
          {kinds.map((kind, i) => {
            const { Icon, color } = meta(kind);
            return (
              <li key={kind}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => {
                    onPick(kind);
                    onClose();
                  }}
                  className={
                    "flex w-full items-center gap-2.5 px-3 py-2 text-left " +
                    (i === active ? "bg-neutral-100 dark:bg-neutral-800" : "")
                  }
                >
                  <span className="shrink-0" style={{ color }} aria-hidden>
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                      {t(`wf.lib.${kind}.name`)}
                    </span>
                    <span className="block truncate text-xs text-neutral-400">{t(`wf.lib.${kind}.desc`)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
