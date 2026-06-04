"use client";

// Conversation history sidebar (presentational). Ported from v1
// public/chat-history.js. Search (query/onQuery) filters the list client-side
// by title; rows open on click; inline rename (double-click title or pencil)
// and delete are per-row. The only durable state is `renaming` (id under edit).

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useT } from "@/i18n/provider";
import { chat } from "@/i18n/dictionaries/chat";
import type { Conv } from "./types";

export function ConversationSidebar({
  convs,
  activeId,
  query,
  onQuery,
  onOpen,
  onNew,
  onDelete,
  onRename,
}: {
  convs: Conv[];
  activeId: string | null;
  query: string;
  onQuery(q: string): void;
  onOpen(id: string): void;
  onNew(): void;
  onDelete(id: string): void;
  onRename(id: string, title: string): void;
}) {
  const t = useT(chat);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const titleOf = (c: Conv) => (c.title && c.title.trim()) || t("chat.histUntitled");

  const q = query.trim().toLowerCase();
  const shown = q ? convs.filter((c) => titleOf(c).toLowerCase().includes(q)) : convs;

  function beginRename(c: Conv) {
    setRenaming(c.id);
    setDraft(c.title || "");
  }
  function commitRename(id: string) {
    const v = draft.trim();
    setRenaming(null);
    if (v) onRename(id, v);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-3.5">
        <span className="text-xs font-bold uppercase tracking-wide text-neutral-400">
          {t("chat.histTitle")}
        </span>
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

      <div
        role="list"
        aria-label={t("chat.histListAria")}
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-3"
      >
        {shown.length === 0 ? (
          <div className="m-auto px-3 py-6 text-center text-sm text-neutral-400">
            {q ? t("chat.histNoMatch") : t("chat.histEmpty")}
          </div>
        ) : (
          shown.map((c) => {
            const active = c.id === activeId;
            const editing = renaming === c.id;
            return (
              <div
                key={c.id}
                role="listitem"
                aria-current={active ? "true" : undefined}
                onClick={() => !editing && onOpen(c.id)}
                className={
                  "group flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-2 " +
                  (active
                    ? "bg-blue-50 dark:bg-blue-950/40"
                    : "hover:bg-neutral-100 dark:hover:bg-neutral-800")
                }
              >
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
                    <div className="flex flex-shrink-0 items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
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
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
