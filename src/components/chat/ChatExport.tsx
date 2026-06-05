"use client";

// Export the current conversation — the v2 counterpart of v1's chat-export.js
// download menu. One circular download-icon button that opens a dropdown to pick
// the format (Markdown / JSON), using the Wave 0 export helpers. ChatMsg[] is
// structurally compatible with toMarkdown's {role,content}[] input.

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { useT } from "@/i18n/provider";
import { chat } from "@/i18n/dictionaries/chat";
import { downloadMarkdown, downloadJson, downloadPdf, toMarkdown } from "@/lib/export";
import type { ChatMsg } from "./types";

const item =
  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-neutral-700 " +
  "hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800";

export function ChatExport({
  messages,
  title,
  open: openProp,
  onOpenChange,
}: {
  messages: ChatMsg[];
  title: string;
  open?: boolean; // controlled (e.g. opened by the /xuat slash command); falls back to internal state
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useT(chat);
  const [openInner, setOpenInner] = useState(false);
  const open = openProp ?? openInner;
  const setOpen = (v: boolean) => (onOpenChange ? onOpenChange(v) : setOpenInner(v));
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
  // FEAT-3: PDF render of the conversation (jspdf via the export lib).
  function onPdf() {
    downloadPdf(`${title}.pdf`, title, toMarkdown(messages));
    setOpen(false);
  }
  // FEAT-3: copy the whole conversation (Markdown) to the clipboard.
  function onCopyAll() {
    navigator.clipboard?.writeText(toMarkdown(messages)).catch(() => {});
    setOpen(false);
  }

  // FEAT-3: total tokens across the conversation (local model → cost is free).
  const totalTokens = messages.reduce((s, m) => s + (m.tokensIn ?? 0) + (m.tokensOut ?? 0), 0);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label={t("chat.expTitle")}
        title={t("chat.expTitle")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
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
          <button type="button" role="menuitem" className={item} title={t("chat.expDownloadPdfTitle")} onClick={onPdf}>
            {t("chat.expDownloadPdf")}
          </button>
          <button type="button" role="menuitem" className={item} title={t("chat.expCopyMdTitle")} onClick={onCopyAll}>
            {t("chat.expCopyMd")}
          </button>
          {totalTokens > 0 && (
            <div className="border-t border-neutral-100 px-3 py-1.5 text-[11px] text-neutral-400 dark:border-neutral-700">
              {t("chat.expTotalTokens", { n: totalTokens })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
