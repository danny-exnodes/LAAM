"use client";

import { useEffect, useRef, useState } from "react";

type Conv = { id: string; title: string; updatedAt: string | null };
type Msg = { role: string; content: string };

export function ChatClient() {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadConvs();
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function loadConvs() {
    const r = await fetch("/api/conversations");
    const d = await r.json().catch(() => ({ conversations: [] }));
    setConvs(d.conversations ?? []);
  }

  async function openConv(id: string) {
    setActiveId(id);
    const r = await fetch(`/api/conversations/${id}`);
    const d = await r.json().catch(() => ({ messages: [] }));
    setMessages((d.messages ?? []).map((m: Msg) => ({ role: m.role, content: m.content })));
  }

  function newConv() {
    setActiveId(null);
    setMessages([]);
  }

  async function deleteConv(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (activeId === id) newConv();
    void loadConvs();
  }

  function setLastAssistant(prev: Msg[], content: string): Msg[] {
    const copy = [...prev];
    for (let i = copy.length - 1; i >= 0; i--) {
      if (copy[i].role === "assistant") {
        copy[i] = { ...copy[i], content };
        break;
      }
    }
    return copy;
  }

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setMessages((p) => [...p, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setStreaming(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId: activeId ?? undefined, message: text }),
      });
      const convId = res.headers.get("x-conversation-id");
      if (!res.ok || !res.body) {
        const errTxt = await res.text().catch(() => "Lỗi");
        setMessages((p) => setLastAssistant(p, errTxt || "Lỗi"));
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMessages((p) => setLastAssistant(p, acc));
      }
      if (!activeId && convId) setActiveId(convId);
      void loadConvs();
    } catch {
      setMessages((p) => setLastAssistant(p, "Lỗi kết nối tới máy chủ."));
    } finally {
      setStreaming(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-neutral-200 dark:border-neutral-800">
        <div className="p-3">
          <button
            onClick={newConv}
            className="w-full rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            + Cuộc trò chuyện mới
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {convs.length === 0 ? (
            <p className="px-2 py-4 text-xs text-neutral-400">Chưa có hội thoại.</p>
          ) : (
            convs.map((c) => (
              <div
                key={c.id}
                onClick={() => openConv(c.id)}
                className={
                  "group flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm " +
                  (activeId === c.id
                    ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                    : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800")
                }
              >
                <span className="truncate">{c.title}</span>
                <button
                  onClick={(e) => deleteConv(c.id, e)}
                  className="shrink-0 text-neutral-400 opacity-0 hover:text-red-500 group-hover:opacity-100"
                  title="Xoá"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Main */}
      <section className="flex min-w-0 flex-1 flex-col">
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-6">
            {messages.length === 0 ? (
              <div className="mt-24 text-center text-neutral-400">
                <p className="text-lg font-semibold">Chat với Gemma 4</p>
                <p className="mt-1 text-sm">Chạy cục bộ trên máy chủ nội bộ · miễn phí. Nhập câu hỏi bên dưới.</p>
              </div>
            ) : (
              <div className="space-y-5">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
                  >
                    <div
                      className={
                        "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed " +
                        (m.role === "user"
                          ? "bg-[var(--color-accent)] text-white"
                          : "border border-neutral-200 bg-white text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100")
                      }
                    >
                      {m.content || (streaming ? "…" : "")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-neutral-200 p-3 dark:border-neutral-800">
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="Nhắn cho Gemma… (Enter gửi, Shift+Enter xuống dòng)"
              className="max-h-40 min-h-[44px] flex-1 resize-none rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-[var(--color-accent)] dark:border-neutral-700 dark:bg-neutral-950"
            />
            <button
              onClick={send}
              disabled={streaming || !input.trim()}
              className="h-11 shrink-0 rounded-xl bg-[var(--color-accent)] px-5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {streaming ? "…" : "Gửi"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
