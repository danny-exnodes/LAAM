"use client";
import { useCallback, useRef, useState } from "react";
import { splitFrames } from "@/lib/chat/frames";
import type { ViewDescriptor } from "@/lib/agent/view";

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
  onView,
  // Bắn đúng một lần ở đầu MỖI lượt gửi. Client dùng nó để reset cờ "lượt này đã có
  // nguồn A chưa". Đặt ở đây chứ không ở chỗ gọi vì client có HAI đường gửi (nút gửi
  // và đường thoại) — reset ở một đường sẽ để cờ bẩn cho đường kia.
  onTurnStart,
  // Progress ping for the caption strip: called with the RUNNING TOTAL of tool calls seen so
  // far this turn, each time that total grows. A voice turn takes 15-30s and the strip is
  // otherwise empty the whole time, so the page reads as frozen; tool-call frames already
  // arrive on this stream and are the only live evidence work is happening.
  // Deliberately passes a COUNT, not the tool name — the caption must not leak any
  // connector's internal tool names, and a number is what the user actually needs.
  onActivity,
  // D3: hội thoại đang mở sẵn (deep-link ?conv=<id> từ /chat) — lượt gửi ĐẦU TIÊN sẽ
  // tiếp tục đúng hội thoại đó thay vì server tự tạo mới. Vắng mặt ⇒ hành vi cũ.
  initialConversationId,
}: {
  onText: (full: string) => void;
  onPendingWrite: (pw: PendingWrite) => void;
  onView?: (d: ViewDescriptor) => void;
  onTurnStart?: () => void;
  onActivity?: (toolCalls: number) => void;
  initialConversationId?: string;
}) {
  const [streaming, setStreaming] = useState(false);
  const toolCallsRef = useRef(0); // tool calls seen this turn (see onActivity)
  // convId: ref cho consume() đọc/ghi tức thời (tránh closure cũ — consume chỉ
  // memo theo [onText, onPendingWrite], không theo convId). conversationId: state
  // SONG SONG chỉ để expose ra ngoài — dùng ref.current trực tiếp ở return KHÔNG đủ:
  // streaming đi false→true→false trong 1 lượt gửi nét về ĐÚNG giá trị ban đầu, nên
  // React (auto-batch) có thể bỏ qua commit render đó, và result/UI ngoài sẽ không
  // thấy convId mới dù ref đã đổi. setConversationId() là một thay đổi giá trị THẬT
  // (undefined→id), không rơi vào bẫy bailout đó.
  const convId = useRef<string | undefined>(initialConversationId);
  const [conversationId, setConversationId] = useState<string | undefined>(initialConversationId);

  const consume = useCallback(
    async (body: Record<string, unknown>) => {
      onTurnStart?.();
      toolCallsRef.current = 0; // per-turn: a stale count would overstate progress next turn
      setStreaming(true);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          // This hook is the /constellation (voice-first) client: every request is a voice
          // request. Inject here so BOTH send and confirm carry mode → spoken-register replies.
          body: JSON.stringify({ mode: "voice", ...body, conversationId: convId.current }),
        });
        const next = res.headers.get("x-conversation-id") ?? convId.current;
        convId.current = next;
        setConversationId(next);
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
            else if (f.t === "view") onView?.(f.d);
          }
          // Count rather than increment: splitFrames() re-parses the WHOLE accumulated buffer
          // on every chunk, so each frame is seen again and again. Counting what is present is
          // idempotent; a per-sighting increment would inflate wildly. Only "call" frames
          // count — a "result" is the same step finishing, not a new one.
          const calls = frames.filter((f) => f.t === "tool" && f.phase === "call").length;
          if (calls > toolCallsRef.current) {
            toolCallsRef.current = calls;
            onActivity?.(calls);
          }
        }
      } finally {
        setStreaming(false);
      }
    },
    [onText, onPendingWrite, onView, onTurnStart, onActivity]
  );

  const send = useCallback(
    (opts: SendOpts) => consume(opts as Record<string, unknown>),
    [consume]
  );

  const confirm = useCallback(
    (token: string, approve: boolean) => consume({ confirm: { token, approve } }),
    [consume]
  );

  return { send, confirm, streaming, conversationId };
}
