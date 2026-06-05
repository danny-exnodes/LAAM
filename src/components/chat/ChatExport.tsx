"use client";

// Export the current conversation — the v2 counterpart of v1's chat-export.js
// download menu. One circular download-icon button that opens a dropdown to pick
// the format (Markdown / JSON), using the Wave 0 export helpers. ChatMsg[] is
// structurally compatible with toMarkdown's {role,content}[] input.

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { useT } from "@/i18n/provider";
import { chat } from "@/i18n/dictionaries/chat";
import { downloadMarkdown, downloadJson, toMarkdown } from "@/lib/export";
import type { ChatMsg } from "./types";

const item =
  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-neutral-700 " +
  "hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800";

export function ChatExport({ messages, title }: { messages: ChatMsg[]; title: string }) {
  const t = useT(chat);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function onMd() {
    downloadMarkdown(`${title}.md`, toMarkdown(messages));
    setOpen(false);
  }
  function onJson() {
    downloadJson(`${title}.json`, messages);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label={t("chat.expTitle")}
        title={t("chat.expTitle")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="grid h-9 w-9 place-items-center rounded-full text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
      >
        <Download size={18} aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-xl bg-white p-1 shadow-lg ring-1 ring-black/5 dark:bg-neutral-800 dark:ring-white/10"
        >
          <button type="button" role="menuitem" className={item} title={t("chat.expDownloadMdTitle")} onClick={onMd}>
            {t("chat.expDownloadMd")}
          </button>
          <button type="button" role="menuitem" className={item} title={t("chat.expDownloadJsonTitle")} onClick={onJson}>
            {t("chat.expDownloadJson")}
          </button>
        </div>
      )}
    </div>
  );
}
