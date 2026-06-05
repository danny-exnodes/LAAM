"use client";

// Conversation history sidebar (presentational). Ported from v1
// public/chat-history.js, extended (FEAT-1) with: recency grouping (pinned /
// today / yesterday / last-7-days / older), client-side pin-to-top (localStorage),
// and a multi-select bulk-delete mode. Title search stays client-side; when the
// parent supplies server-filtered results (content search) it sets `serverFiltered`
// so this component does not re-filter and hide content-only matches.

import { useEffect, useState } from "react";
import { Pencil, Trash2, Pin, CheckSquare, Square, Sparkles, Eraser } from "lucide-react";
import { useT } from "@/i18n/provider";
import { chat } from "@/i18n/dictionaries/chat";
import type { Conv } from "./types";
import { groupConversations, type ConvGroupKey } from "./convGroups";
import { loadPins, togglePin } from "./pins";

const GROUP_LABEL: Record<ConvGroupKey, string> = {
  pinned: "chat.grpPinned",
  today: "chat.grpToday",
  yesterday: "chat.grpYesterday",
  last7: "chat.grp7days",
  older: "chat.grpOlder",
};

export function ConversationSidebar({
  convs,
  loading = false,
  serverFiltered = false,
  activeId,
  query,
  onQuery,
  onOpen,
  onNew,
  onDelete,
  onBulkDelete,
  onRename,
  onCleanup,
  onSmartRename,
}: {
  convs: Conv[];
  loading?: boolean;
  serverFiltered?: boolean;
  activeId: string | null;
  query: string;
  onQuery(q: string): void;
  onOpen(id: string): void;
  onNew(): void;
  onDelete(id: string): void;
  onBulkDelete?(ids: string[]): void;
  onRename(id: string, title: string): void;
  onCleanup?(): void; // S1: backfill polluted titles
  onSmartRename?(id: string): void; // S9: re-derive one conv's title from its content
}) {
  const t = useT(chat);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => setPinned(loadPins()), []);

  const titleOf = (c: Conv) => (c.title && c.title.trim()) || t("chat.histUntitled");

  const q = query.trim().toLowerCase();
  // Title filter is client-side unless the parent already content-filtered.
  const shown = q && !serverFiltered ? convs.filter((c) => titleOf(c).toLowerCase().includes(q)) : convs;
  const groups = groupConversations(shown, pinned, Date.now());

  // S1: offer cleanup only when some titles leaked attachment bytes ("--- Tệp:…").
  const hasPolluted = convs.some((c) => (c.title || "").startsWith("--- "));
  // S1: flag duplicate titles (warn, non-destructive — user removes via multi-select).
  const titleCounts = new Map<string, number>();
  for (const c of convs) {
    const k = titleOf(c).toLowerCase();
    titleCounts.set(k, (titleCounts.get(k) || 0) + 1);
  }
  const isDup = (c: Conv) => (titleCounts.get(titleOf(c).toLowerCase()) || 0) > 1;

  function beginRename(c: Conv) {
    setRenaming(c.id);
    setDraft(c.title || "");
  }
  function commitRename(id: string) {
    const v = draft.trim();
    setRenaming(null);
    if (v) onRename(id, v);
  }
  function onPin(c: Conv) {
    setPinned((p) => togglePin(p, c.id));
  }
  function toggleSelected(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
  }
  function runBulkDelete() {
    const ids = [...selected];
    if (!ids.length) return;
    if (!window.confirm(t("chat.bulkDeleteConfirm", { n: ids.length }))) return;
    if (onBulkDelete) onBulkDelete(ids);
    else ids.forEach((id) => onDelete(id));
    exitSelect();
  }

  function renderRow(c: Conv) {
    const active = c.id === activeId;
    const editing = renaming === c.id;
    const checked = selected.has(c.id);
    const isPinned = pinned.has(c.id);
    return (
      <div
        key={c.id}
        role="listitem"
        aria-current={active ? "true" : undefined}
        onClick={() => {
          if (editing) return;
          if (selectMode) toggleSelected(c.id);
          else onOpen(c.id);
        }}
        className={
          "group flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-2 " +
          (active
            ? "bg-blue-50 dark:bg-blue-950/40"
            : "hover:bg-neutral-100 dark:hover:bg-neutral-800")
        }
      >
        {selectMode && (
          <button
            type="button"
            aria-label={t("chat.selectRowAria")}
            aria-pressed={checked}
            onClick={(e) => {
              e.stopPropagation();
              toggleSelected(c.id);
            }}
            className="grid h-7 w-7 shrink-0 place-items-center text-neutral-400"
          >
            {checked ? <CheckSquare size={15} className="text-blue-600" /> : <Square size={15} />}
          </button>
        )}
        {editing ? (
          <input
            type="text"
            aria-label={t("chat.histRenameInputAria")}
            value={draft}
            autoFocus
            maxLength={120}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commitRename(c.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitRename(c.id);
              } else if (e.key === "Escape") {
                e.preventDefault();
                setRenaming(null);
              }
            }}
            className="w-full rounded border border-blue-500 bg-white px-1.5 py-0.5 text-sm text-neutral-800 outline-none dark:bg-neutral-900 dark:text-neutral-100"
          />
        ) : (
          <>
            {isPinned && !selectMode && (
              <Pin size={12} className="shrink-0 fill-amber-400 text-amber-500" aria-hidden />
            )}
            <span
              onDoubleClick={(e) => {
                e.stopPropagation();
                beginRename(c);
              }}
              title={titleOf(c)}
              className={
                "flex-1 truncate text-sm " +
                (active
                  ? "font-semibold text-blue-600 dark:text-blue-400"
                  : "text-neutral-700 dark:text-neutral-200")
              }
            >
              {titleOf(c)}
            </span>
            {isDup(c) && !selectMode && (
              <span
                title={t("chat.dupTitle")}
                className="shrink-0 rounded bg-neutral-200 px-1 text-[10px] text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400"
              >
                {t("chat.dupBadge")}
              </span>
            )}
            {!selectMode && (
              <div className="flex flex-shrink-0 items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                {onSmartRename && (
                  <button
                    type="button"
                    aria-label={t("chat.smartRenameAria")}
                    title={t("chat.smartRenameAria")}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSmartRename(c.id);
                    }}
                    className="grid h-7 w-7 place-items-center rounded text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700 dark:hover:bg-neutral-700"
                  >
                    <Sparkles size={13} aria-hidden />
                  </button>
                )}
                <button
                  type="button"
                  aria-label={isPinned ? t("chat.unpinAria") : t("chat.pinAria")}
                  title={isPinned ? t("chat.unpinAria") : t("chat.pinAria")}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPin(c);
                  }}
                  className={
                    "grid h-7 w-7 place-items-center rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 " +
                    (isPinned ? "text-amber-500" : "text-neutral-400 hover:text-neutral-700")
                  }
                >
                  <Pin size={13} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={t("chat.histRenameAria")}
                  title={t("chat.histRenameTitle")}
                  onClick={(e) => {
                    e.stopPropagation();
                    beginRename(c);
                  }}
                  className="grid h-7 w-7 place-items-center rounded text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700 dark:hover:bg-neutral-700"
                >
                  <Pencil size={13} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={t("chat.histDeleteAria")}
                  title={t("chat.histDeleteTitle")}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(t("chat.histDeleteConfirm"))) onDelete(c.id);
                  }}
                  className="grid h-7 w-7 place-items-center rounded text-neutral-400 hover:bg-red-500 hover:text-white"
                >
                  <Trash2 size={13} aria-hidden />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-3.5">
        <span className="text-xs font-bold uppercase tracking-wide text-neutral-400">
          {t("chat.histTitle")}
        </span>
        <div className="flex items-center gap-1.5">
          {hasPolluted && onCleanup && (
            <button
              type="button"
              aria-label={t("chat.cleanupTitles")}
              title={t("chat.cleanupTitles")}
              onClick={onCleanup}
              className="grid h-7 w-7 place-items-center rounded-lg border border-amber-300 text-amber-600 hover:bg-amber-50 dark:border-amber-500/40 dark:text-amber-400 dark:hover:bg-amber-950/40"
            >
              <Eraser size={13} aria-hidden />
            </button>
          )}
          <button
            type="button"
            aria-label={selectMode ? t("chat.selectDone") : t("chat.selectMode")}
            title={selectMode ? t("chat.selectDone") : t("chat.selectMode")}
            onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
            className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs font-semibold text-neutral-600 hover:border-blue-500 hover:text-blue-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
          >
            {selectMode ? t("chat.selectDone") : t("chat.selectMode")}
          </button>
          <button
            type="button"
            aria-label={t("chat.histNewAria")}
            title={t("chat.histNewAria")}
            onClick={onNew}
            className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-semibold text-neutral-600 hover:border-blue-500 hover:text-blue-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
          >
            + {t("chat.histNew")}
          </button>
        </div>
      </div>

      <div className="px-3 pb-2.5">
        <input
          type="search"
          aria-label={t("chat.histFilterAria")}
          placeholder={t("chat.histFilterPh")}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-sm text-neutral-800 outline-none focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        />
      </div>

      {selectMode && (
        <div className="flex items-center justify-between gap-2 px-3 pb-2 text-xs">
          <span className="text-neutral-500">{t("chat.selectedCount", { n: selected.size })}</span>
          <button
            type="button"
            onClick={runBulkDelete}
            disabled={selected.size === 0}
            className="inline-flex items-center gap-1 rounded-lg bg-red-500 px-2.5 py-1 font-semibold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 size={13} aria-hidden /> {t("chat.bulkDelete")}
          </button>
        </div>
      )}

      <div
        role="list"
        aria-label={t("chat.histListAria")}
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-3"
      >
        {loading && convs.length === 0 ? (
          // U-minor: skeleton until the first load resolves (no "no conversations" flash).
          <div className="flex flex-col gap-1 px-1 py-1" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-9 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800/60" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className="m-auto px-3 py-6 text-center text-sm text-neutral-400">
            {q ? t("chat.histNoMatch") : t("chat.histEmpty")}
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.key} className="flex flex-col gap-0.5">
              <div className="px-2.5 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                {t(GROUP_LABEL[g.key])}
              </div>
              {g.convs.map(renderRow)}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
