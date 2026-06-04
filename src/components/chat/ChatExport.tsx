"use client";

// Export the current conversation — the v2 counterpart of v1's chat-export.js
// download menu. Two buttons: Markdown (toMarkdown → downloadMarkdown) and JSON
// (downloadJson with the raw message array), using the Wave 0 export helpers.
// ChatMsg[] is structurally compatible with toMarkdown's {role,content}[] input.

import { useT } from "@/i18n/provider";
import { chat } from "@/i18n/dictionaries/chat";
import { downloadMarkdown, downloadJson, toMarkdown } from "@/lib/export";
import type { ChatMsg } from "./types";

const btn =
  "rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 " +
  "hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800";

export function ChatExport({ messages, title }: { messages: ChatMsg[]; title: string }) {
  const t = useT(chat);

  function onMd() {
    downloadMarkdown(`${title}.md`, toMarkdown(messages));
  }

  function onJson() {
    downloadJson(`${title}.json`, messages);
  }

  return (
    <div className="flex gap-2">
      <button type="button" className={btn} title={t("chat.expDownloadMdTitle")} onClick={onMd}>
        {t("chat.expDownloadMd")}
      </button>
      <button type="button" className={btn} title={t("chat.expDownloadJsonTitle")} onClick={onJson}>
        {t("chat.expDownloadJson")}
      </button>
    </div>
  );
}
