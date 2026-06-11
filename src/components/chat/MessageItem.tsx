"use client";

// One chat message bubble + hover action toolbar — the v2 counterpart of v1's
// public/chat-actions.js (toolbar) and the per-role rendering in chat-render.js.
// Assistant content goes through the Wave 0 MarkdownView (tables / ```chart /
// ```map / code); user content is a plain pre-wrapped bubble. Purely
// presentational: every action calls a callback from props, no own state.
//
// Action parity with v1: copy + delete on both roles, edit on user only,
// regenerate on assistant only; edit/regenerate/delete are disabled while a
// reply is streaming (copy never mutates, so it stays enabled). An empty
// assistant message during streaming shows a "typing…" placeholder.

import { ChatMarkdown } from "@/components/render/ChatMarkdown";
import { useT } from "@/i18n/provider";
import { chat } from "@/i18n/dictionaries/chat";
import type { ChatMsg } from "./types";
import { ToolTrace } from "./ToolTrace";
import { Citations } from "./Citations";
import { ConfirmCard } from "./ConfirmCard";
import { AttachmentPreview } from "./AttachmentChips";

// Relative-time line from an epoch-ms timestamp. Local + dependency-free: the
// shared format.ago() takes a Date and is Vietnamese-only, while createdAt here
// is ms; both render the same Vietnamese phrasing so the page reads uniformly.
function relTime(ms: number): string {
  const d = Date.now() - ms;
  if (d < 60_000) return "vừa xong";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} phút trước`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} giờ trước`;
  return `${Math.floor(d / 86_400_000)} ngày trước`;
}

export interface MessageItemProps {
  msg: ChatMsg;
  streaming: boolean;
  onCopy(m: ChatMsg): void;
  onEdit(m: ChatMsg): void;
  onRegenerate(m: ChatMsg): void;
  onDelete(m: ChatMsg): void;
  onConfirm?(msgId: string, approve: boolean): void;
}

const actionBtn =
  "rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 " +
  "hover:bg-neutral-100 disabled:opacity-45 disabled:cursor-default " +
  "dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800";

export function MessageItem({
  msg,
  streaming,
  onCopy,
  onEdit,
  onRegenerate,
  onDelete,
  onConfirm,
}: MessageItemProps) {
  const t = useT(chat);
  const isUser = msg.role === "user";
  const isAssistant = msg.role === "assistant";
  const isEmpty = !msg.content || msg.content.trim() === "";

  return (
    <div className={`group flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}>
      {/* Attachment previews — PERSISTED, so a reloaded message still shows what was
          attached (thumbnail + name/size). Rendered above the bubble (the blue bubble
          would clash with the white cards). */}
      {isUser && msg.attachments && msg.attachments.length > 0 && (
        <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
          {msg.attachments.map((a, i) => (
            <AttachmentPreview key={i} att={a} />
          ))}
        </div>
      )}
      <div
        className={
          isUser
            ? "max-w-[85%] whitespace-pre-wrap rounded-2xl bg-blue-600 px-4 py-2 text-white"
            : "max-w-full rounded-2xl bg-neutral-100 px-4 py-2 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
        }
      >
        {isAssistant && isEmpty && streaming ? (
          // S3: while the turn works, show LIVE tool chips (ToolTrace renders "đang
          // gọi <tool>…" for in-flight calls) above an animated processing indicator.
          <>
            <ToolTrace items={msg.toolTrace} />
            <span className="inline-flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
              {t("chat.thinking")}
              <span className="inline-flex gap-0.5" aria-hidden>
                <span className="h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
                <span className="h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
                <span className="h-1 w-1 animate-bounce rounded-full bg-current" />
              </span>
            </span>
          </>
        ) : isAssistant ? (
          <>
            <ToolTrace items={msg.toolTrace} />
            <ChatMarkdown source={msg.content} />
            <Citations names={msg.cites} />
            {msg.pendingWrite && onConfirm && (
              <ConfirmCard
                pending={msg.pendingWrite}
                onConfirm={(approve) => onConfirm(msg.id, approve)}
              />
            )}
          </>
        ) : (
          msg.content
        )}
      </div>

      {/* UX-7: reveal on hover OR keyboard focus-within (a11y) — was hover-only. */}
      <div className="flex flex-wrap items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
        <button
          type="button"
          className={actionBtn}
          title={t("chat.actCopyTitle")}
          aria-label={t("chat.actCopyTitle")}
          onClick={() => onCopy(msg)}
        >
          {t("chat.actCopy")}
        </button>

        {isUser && (
          <button
            type="button"
            className={actionBtn}
            title={t("chat.actEditTitle")}
            aria-label={t("chat.actEditTitle")}
            disabled={streaming}
            onClick={() => onEdit(msg)}
          >
            {t("chat.actEdit")}
          </button>
        )}

        {isAssistant && (
          <button
            type="button"
            className={actionBtn}
            title={t("chat.actRegenTitle")}
            aria-label={t("chat.actRegenTitle")}
            disabled={streaming}
            onClick={() => onRegenerate(msg)}
          >
            {t("chat.actRegen")}
          </button>
        )}

        <button
          type="button"
          className={actionBtn}
          title={t("chat.actDeleteTitle")}
          aria-label={t("chat.actDeleteTitle")}
          disabled={streaming}
          onClick={() => onDelete(msg)}
        >
          {t("chat.actDelete")}
        </button>

        {msg.createdAt != null && (
          <span className="ml-1 text-xs text-neutral-400">{relTime(msg.createdAt)}</span>
        )}

        {isAssistant && (msg.tokensOut ?? 0) > 0 && (
          <span
            className="text-xs tabular-nums text-neutral-400"
            title={t("chat.msgTokensTitle")}
          >
            {t("chat.msgTokens", { in: msg.tokensIn ?? 0, out: msg.tokensOut ?? 0 })}
          </span>
        )}
      </div>
    </div>
  );
}
