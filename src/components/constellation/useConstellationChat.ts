"use client";
import { useCallback, useRef, useState } from "react";
import { splitFrames } from "@/lib/chat/frames";

export type PendingWrite = {
  token: string;
  tool: string;
  title: string;
  summary: string;
};

type SendOpts = {
  message: string;
  model?: string;
  customAgentId?: string;
  requestedTool?: { name: string; args: unknown };
};

export function useConstellationChat({
  onText,
  onPendingWrite,
}: {
  onText: (full: string) => void;
  onPendingWrite: (pw: PendingWrite) => void;
}) {
  const [streaming, setStreaming] = useState(false);
  const convId = useRef<string | undefined>(undefined);

  const consume = useCallback(
    async (body: Record<string, unknown>) => {
      setStreaming(true);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          // This hook is the /constellation (voice-first) client: every request is a voice
          // request. Inject here so BOTH send and confirm carry mode → spoken-register replies.
          body: JSON.stringify({ mode: "voice", ...body, conversationId: convId.current }),
        });
        convId.current = res.headers.get("x-conversation-id") ?? convId.current;
        const reader = res.body!.getReader();
        const dec = new TextDecoder();
        let raw = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          raw += dec.decode(value, { stream: true });
          const { text, frames } = splitFrames(raw);
          onText(text);
          for (const f of frames) {
            if (f.t === "pending_write") onPendingWrite(f as unknown as PendingWrite);
          }
        }
      } finally {
        setStreaming(false);
      }
    },
    [onText, onPendingWrite]
  );

  const send = useCallback(
    (opts: SendOpts) => consume(opts as Record<string, unknown>),
    [consume]
  );

  const confirm = useCallback(
    (token: string, approve: boolean) => consume({ confirm: { token, approve } }),
    [consume]
  );

  return { send, confirm, streaming };
}
