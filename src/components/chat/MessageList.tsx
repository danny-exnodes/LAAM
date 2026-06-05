"use client";

// The chat transcript: maps messages → MessageItem and threads the action
// callbacks straight through. A trailing scroll-anchor div lets the ChatClient
// scroll the newest message into view. Purely presentational — no own state.

import { MessageItem } from "./MessageItem";
import type { ChatMsg } from "./types";

export interface MessageListProps {
  messages: ChatMsg[];
  streaming: boolean;
  onCopy(m: ChatMsg): void;
  onEdit(m: ChatMsg): void;
  onRegenerate(m: ChatMsg): void;
  onDelete(m: ChatMsg): void;
  onConfirm?(msgId: string, approve: boolean): void;
}

export function MessageList({
  messages,
  streaming,
  onCopy,
  onEdit,
  onRegenerate,
  onDelete,
  onConfirm,
}: MessageListProps) {
  return (
    <div className="flex flex-col gap-4">
      {messages.map((m) => (
        <MessageItem
          key={m.id}
          msg={m}
          streaming={streaming}
          onCopy={onCopy}
          onEdit={onEdit}
          onRegenerate={onRegenerate}
          onDelete={onDelete}
          onConfirm={onConfirm}
        />
      ))}
      <div data-scroll-anchor />
    </div>
  );
}
