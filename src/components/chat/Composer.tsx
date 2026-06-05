"use client";

// Chat composer (presentational). Ported from v1 public/chat-composer.js + the
// kernel's baseline composer, collapsed into one controlled React component.
// Holds only ephemeral UI state (slash-menu visibility, drag-over). All durable
// state + actions come via props from ChatClient.

import { useRef, useState } from "react";
import { Paperclip, Link2, Send } from "lucide-react";
import { useT } from "@/i18n/provider";
import { chat } from "@/i18n/dictionaries/chat";
import type { Attachment } from "./types";

// Slash commands. ASCII names survive IME composition; labels are localized.
// Only /dung maps to a prop here (onStop); the rest are owned by ChatClient's
// own controls, so picking them just clears the slash text.
const COMMANDS: { name: string; labelKey: string }[] = [
  { name: "moi", labelKey: "chat.cmdNew" },
  { name: "xoa", labelKey: "chat.cmdClear" },
  { name: "dung", labelKey: "chat.cmdStop" },
  { name: "xuat", labelKey: "chat.cmdExport" },
  { name: "caidat", labelKey: "chat.cmdSettings" },
];

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  attachments,
  onAddFiles,
  onAddUrl,
  onRemoveAttachment,
}: {
  value: string;
  onChange(v: string): void;
  onSend(): void;
  onStop(): void;
  streaming: boolean;
  attachments: Attachment[];
  onAddFiles(files: FileList): void;
  onAddUrl(url: string): void;
  onRemoveAttachment(id: string): void;
}) {
  const t = useT(chat);
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const empty = value.trim().length === 0;
  const sendDisabled = streaming || empty;

  // Slash menu: shown when the input starts with "/", filtered by the token
  // after the slash (up to whitespace).
  const slashOpen = value.startsWith("/");
  const slashQuery = slashOpen ? value.slice(1).split(/\s/)[0].toLowerCase() : "";
  const matches = slashOpen
    ? COMMANDS.filter((c) => c.name.startsWith(slashQuery))
    : [];

  function pickCommand(name: string) {
    onChange("");
    if (name === "dung") onStop();
    // moi/xoa/xuat/caidat are driven by ChatClient's own controls — clearing
    // the slash text is all this presentational component can do.
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onStop();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (slashOpen && matches.length) pickCommand(matches[0].name);
      else if (!sendDisabled) onSend();
    }
  }

  function pickUrl() {
    const url = window.prompt(t("chat.urlPrompt"));
    if (url && url.trim()) onAddUrl(url.trim());
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer?.files;
    if (files && files.length) onAddFiles(files);
  }

  return (
    <div
      className="relative flex flex-col gap-2 rounded-2xl bg-white p-3 shadow-lg ring-1 ring-black/5 dark:bg-neutral-900 dark:ring-white/10"
      onDragOver={(e) => {
        if (e.dataTransfer?.types?.includes("Files")) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-blue-500 bg-white/80 text-center dark:bg-neutral-900/80">
          <span className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
            {t("chat.dropHere")}
          </span>
          <span className="mt-1 text-xs text-neutral-400">{t("chat.dropFormats")}</span>
        </div>
      )}

      {/* attachment chips */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {attachments.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
            >
              {t("chat.attachChars", { name: a.name, n: a.chars })}
              <button
                type="button"
                aria-label={t("chat.attachRemoveAria")}
                onClick={() => onRemoveAttachment(a.id)}
                className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-100"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* slash-command menu */}
      {slashOpen && matches.length > 0 && (
        <div
          role="listbox"
          className="absolute bottom-full left-0 right-0 z-30 mb-2 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
        >
          <div className="border-b border-neutral-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400 dark:border-neutral-700">
            {t("chat.cmdMenuHead")}
          </div>
          <div className="p-1">
            {matches.map((c) => (
              <button
                key={c.name}
                type="button"
                role="option"
                aria-selected="false"
                onClick={() => pickCommand(c.name)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700"
              >
                <span className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">
                  /{c.name}
                </span>
                <span className="truncate text-neutral-600 dark:text-neutral-300">
                  {t(c.labelKey)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <textarea
        aria-label={t("chat.inputAria")}
        placeholder={t("chat.inputPh")}
        value={value}
        rows={2}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className="w-full resize-none bg-transparent text-sm text-neutral-800 outline-none placeholder:text-neutral-400 dark:text-neutral-100"
      />

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files && e.target.files.length) onAddFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            aria-label={t("chat.attachFileAria")}
            title={t("chat.attachFileTitle")}
            onClick={() => fileInput.current?.click()}
            className="grid h-9 w-9 place-items-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          >
            <Paperclip size={16} aria-hidden />
          </button>
          <button
            type="button"
            aria-label={t("chat.attachUrlAria")}
            title={t("chat.attachUrlTitle")}
            onClick={pickUrl}
            className="grid h-9 w-9 place-items-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          >
            <Link2 size={16} aria-hidden />
          </button>
          {value.length > 0 && (
            <span className="font-mono text-[11px] text-neutral-400">
              {t("chat.counter", { chars: value.length, tokens: Math.ceil(value.length / 4) })}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {streaming && (
            <button
              type="button"
              aria-label={t("chat.stopAria")}
              onClick={onStop}
              className="rounded-full bg-neutral-200 px-4 py-1.5 text-sm font-medium text-neutral-800 hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-100"
            >
              {t("chat.stop")}
            </button>
          )}
          <button
            type="button"
            aria-label={t("chat.sendAria")}
            onClick={onSend}
            disabled={sendDisabled}
            className="flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send size={14} aria-hidden />
            {t("chat.send")}
          </button>
        </div>
      </div>
    </div>
  );
}
