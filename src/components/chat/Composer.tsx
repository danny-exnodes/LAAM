"use client";

// Chat composer (presentational). Ported from v1 public/chat-composer.js + the
// kernel's baseline composer, collapsed into one controlled React component.
// Holds only ephemeral UI state (slash-menu visibility, drag-over). All durable
// state + actions come via props from ChatClient.

import { useRef, useState } from "react";
import { Paperclip, Link2, Send, Wrench } from "lucide-react";
import { useT } from "@/i18n/provider";
import { chat } from "@/i18n/dictionaries/chat";
import type { Attachment, ToolPick } from "./types";
import { coerceNumberInput, type CatalogGroup, type CatalogTool } from "@/lib/chat/toolCatalog";
import { AttachmentPreview } from "./AttachmentChips";

// Slash commands. ASCII names survive IME composition; labels are localized.
// Each command maps to a handler ChatClient owns; picking one runs it and
// clears the slash text. (F1: previously only /dung ran — the rest were inert.)
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
  notice,
  onAddFiles,
  onAddUrl,
  onRemoveAttachment,
  onNew,
  onClear,
  onExport,
  onToggleSettings,
  ocrAvailable = true,
  modelName,
  toolGroups = [],
  toolPick = null,
  onToolPick,
  onToolArg,
}: {
  value: string;
  onChange(v: string): void;
  onSend(): void;
  onStop(): void;
  streaming: boolean;
  attachments: Attachment[];
  notice?: string | null; // W3 vision: thông báo cap ảnh raw (ChatClient sở hữu state)
  onAddFiles(files: FileList): void;
  onAddUrl(url: string): void;
  onRemoveAttachment(id: string): void;
  onNew(): void;
  onClear(): void;
  onExport(): void;
  onToggleSettings(): void;
  ocrAvailable?: boolean;
  modelName?: string;
  // P1 quick-tools: catalog nhóm tool + tool đã chọn (state ở ChatClient).
  toolGroups?: CatalogGroup[];
  toolPick?: ToolPick | null;
  onToolPick?(pick: { tool: CatalogTool; groupLabel: string } | null): void;
  onToolArg?(key: string, value: unknown): void;
}) {
  const t = useT(chat);
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false); // UX-2: inline URL input (replaces window.prompt)
  const [urlDraft, setUrlDraft] = useState("");

  const empty = value.trim().length === 0;
  // P1: tool đã chọn nhưng còn required-arg trống → chặn gửi (UI dẫn nhập, model
  // không phải đoán). Có toolPick + đủ args thì text rỗng vẫn gửi được (ChatClient
  // tự thay message mặc định).
  const missingReq = toolPick
    ? toolPick.tool.args.filter((f) => {
        if (!f.required) return false;
        const v = toolPick.args[f.key];
        return (
          v === undefined ||
          v === null ||
          (typeof v === "string" && v.trim() === "") ||
          (typeof v === "number" && Number.isNaN(v)) // NaN = nhập hỏng, coi như thiếu
        );
      })
    : [];
  const sendDisabled = streaming || (empty && !toolPick) || missingReq.length > 0;

  // Slash menu: shown when the input starts with "/", filtered by the token
  // after the slash (up to whitespace).
  const slashOpen = value.startsWith("/");
  const slashQuery = slashOpen ? value.slice(1).split(/\s/)[0].toLowerCase() : "";
  const matches = slashOpen
    ? COMMANDS.filter((c) => c.name.startsWith(slashQuery))
    : [];
  // P1: tools khớp query (tên hoặc mô tả), giữ theo nhóm, cap tổng để menu gọn.
  const TOOL_MENU_CAP = 12;
  const toolMatches: { group: CatalogGroup; tools: CatalogTool[] }[] = [];
  if (slashOpen) {
    let left = TOOL_MENU_CAP;
    for (const g of toolGroups) {
      if (left <= 0) break;
      const hit = g.tools
        .filter(
          (tool) =>
            tool.name.toLowerCase().includes(slashQuery) ||
            tool.description.toLowerCase().includes(slashQuery),
        )
        .slice(0, left);
      if (hit.length) {
        toolMatches.push({ group: g, tools: hit });
        left -= hit.length;
      }
    }
  }
  const firstTool = toolMatches[0]?.tools[0];

  function pickCommand(name: string) {
    onChange("");
    switch (name) {
      case "moi": return onNew();
      case "xoa": return onClear();
      case "dung": return onStop();
      case "xuat": return onExport();
      case "caidat": return onToggleSettings();
    }
  }

  function pickTool(group: CatalogGroup, tool: CatalogTool) {
    onChange("");
    onToolPick?.({ tool, groupLabel: group.label });
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
      else if (slashOpen && firstTool) pickTool(toolMatches[0].group, firstTool);
      else if (!sendDisabled) onSend();
    }
  }

  function submitUrl() {
    const url = urlDraft.trim();
    if (url) onAddUrl(url);
    setUrlDraft("");
    setUrlOpen(false);
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

      {/* attachment chips — thumbnail (ảnh / trang PDF đầu) + name/size; hover vẫn
          xem excerpt text đã trích. Remove × ở góc. */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {attachments.map((a) => (
            <span
              key={a.id}
              title={a.text.slice(0, 280)} /* FEAT-4: hover shows an excerpt of the extracted text */
              className="relative inline-flex"
            >
              <AttachmentPreview att={a} />
              <button
                type="button"
                aria-label={t("chat.attachRemoveAria")}
                onClick={() => onRemoveAttachment(a.id)}
                className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border border-neutral-300 bg-white text-sm leading-none text-neutral-500 hover:text-neutral-800 dark:border-neutral-600 dark:bg-neutral-900 dark:hover:text-neutral-100"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* W3 vision: cap ảnh raw vượt → degrade sang OCR-text, báo tại chỗ (style khớp ocrOffAttach) */}
      {notice && (
        <p role="status" className="text-[11px] text-amber-600 dark:text-amber-500">
          {notice}
        </p>
      )}

      {/* UX-2: inline URL input — styled, dark-mode aware, non-blocking (was window.prompt) */}
      {urlOpen && (
        <div className="flex items-center gap-1.5">
          <input
            type="url"
            autoFocus
            aria-label={t("chat.urlInputAria")}
            placeholder={t("chat.urlInputPh")}
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitUrl();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setUrlOpen(false);
              }
            }}
            className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-sm text-neutral-800 outline-none focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          />
          <button
            type="button"
            onClick={submitUrl}
            disabled={!urlDraft.trim()}
            className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("chat.urlAdd")}
          </button>
        </div>
      )}

      {/* slash menu: lệnh nhanh + (P1) công cụ theo nhóm */}
      {slashOpen && (matches.length > 0 || toolMatches.length > 0) && (
        <div
          role="listbox"
          className="laam-scroll absolute bottom-full left-0 right-0 z-30 mb-2 max-h-80 overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
        >
          {matches.length > 0 && (
            <>
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
            </>
          )}
          {toolMatches.length > 0 && (
            <>
              <div className="border-b border-neutral-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400 dark:border-neutral-700">
                {t("chat.toolsMenuHead")}
              </div>
              {toolMatches.map(({ group, tools }) => (
                <div key={group.id} className="p-1">
                  <div className="px-2.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                    {group.label}
                  </div>
                  {tools.map((tool) => (
                    <button
                      key={tool.name}
                      type="button"
                      role="option"
                      aria-selected="false"
                      onClick={() => pickTool(group, tool)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700"
                    >
                      <span className="min-w-0 truncate font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">
                        {tool.name}
                      </span>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          tool.kind === "read"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                            : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                        }`}
                      >
                        {tool.kind === "read" ? t("chat.toolKindRead") : t("chat.toolKindWrite")}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-neutral-500 dark:text-neutral-400">
                        {tool.description}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* P1: chip tool đã chọn + dẫn nhập required-args (chỗ user dán UUID project_id…) */}
      {toolPick && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-2.5 dark:border-blue-900/60 dark:bg-blue-950/20">
          <div className="flex items-center gap-2">
            <Wrench size={14} className="shrink-0 text-blue-600 dark:text-blue-400" aria-hidden />
            <span className="min-w-0 truncate font-mono text-xs font-semibold text-blue-700 dark:text-blue-300">
              {toolPick.tool.name}
            </span>
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                toolPick.tool.kind === "read"
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                  : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
              }`}
            >
              {toolPick.tool.kind === "read" ? t("chat.toolKindRead") : t("chat.toolKindWrite")}
            </span>
            <span className="shrink-0 text-[11px] text-neutral-400">{toolPick.groupLabel}</span>
            <button
              type="button"
              aria-label={t("chat.toolClearAria")}
              onClick={() => onToolPick?.(null)}
              className="ml-auto grid h-5 w-5 shrink-0 place-items-center rounded-full text-sm leading-none text-neutral-400 hover:bg-neutral-200/60 hover:text-neutral-700 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
            >
              ×
            </button>
          </div>
          <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">{t("chat.toolPickedHint")}</p>
          {toolPick.tool.args.filter((f) => f.required).length > 0 && (
            <div className="mt-2 flex flex-col gap-1.5">
              {toolPick.tool.args
                .filter((f) => f.required)
                .map((f) => {
                  const raw = toolPick.args[f.key];
                  if (f.kind === "boolean") {
                    return (
                      <label key={f.key} className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-200">
                        <input type="checkbox" aria-label={f.key} checked={raw === true} onChange={(e) => onToolArg?.(f.key, e.target.checked)} />
                        <span className="font-mono font-semibold">{f.key} *</span>
                        {f.description && <span className="text-neutral-400">{f.description}</span>}
                      </label>
                    );
                  }
                  if (f.kind === "enum") {
                    return (
                      <select
                        key={f.key}
                        aria-label={f.key}
                        value={String(raw ?? "")}
                        onChange={(e) => onToolArg?.(f.key, e.target.value)}
                        className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-xs text-neutral-800 outline-none focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                      >
                        <option value="">{`${f.key} *`}</option>
                        {(f.enumValues ?? []).map((v) => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    );
                  }
                  return (
                    <input
                      key={f.key}
                      type={f.kind === "number" ? "number" : "text"}
                      aria-label={f.key}
                      placeholder={`${f.key} *${f.description ? ` — ${f.description}` : ""}`}
                      value={raw === undefined || raw === null ? "" : String(raw)}
                      onChange={(e) =>
                        onToolArg?.(f.key, f.kind === "number" ? coerceNumberInput(e.target.value) : e.target.value)
                      }
                      className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 font-mono text-xs text-neutral-800 outline-none focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                    />
                  );
                })}
            </div>
          )}
          {missingReq.length > 0 && (
            <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-500">
              {t("chat.toolReqMissing", { keys: missingReq.map((f) => f.key).join(", ") })}
            </p>
          )}
        </div>
      )}

      <textarea
        aria-label={t("chat.inputAria")}
        placeholder={t("chat.inputPh", { model: modelName || t("chat.modelFallback") })}
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
            title={ocrAvailable ? t("chat.attachFileTitle") : `${t("chat.attachFileTitle")} · ${t("chat.ocrOff")}`}
            onClick={() => fileInput.current?.click()}
            className="grid h-9 w-9 place-items-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          >
            <Paperclip size={16} aria-hidden />
          </button>
          <button
            type="button"
            aria-label={t("chat.attachUrlAria")}
            title={t("chat.attachUrlTitle")}
            aria-expanded={urlOpen}
            onClick={() => setUrlOpen((v) => !v)}
            className="grid h-9 w-9 place-items-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          >
            <Link2 size={16} aria-hidden />
          </button>
          {value.length > 0 && (
            <span className="font-mono text-[11px] text-neutral-400">
              {t("chat.counter", { chars: value.length, tokens: Math.ceil(value.length / 4) })}
            </span>
          )}
          {!ocrAvailable && value.length === 0 && (
            <span className="text-[11px] text-amber-600 dark:text-amber-500" title={t("chat.ocrOff")}>
              {t("chat.ocrOffAttach")}
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
