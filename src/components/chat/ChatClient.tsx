"use client";

// Chat orchestrator (Wave 3 integration). Owns all chat state + handlers and
// composes the presentational pieces: ConversationSidebar, SettingsPanel,
// MessageList, Composer, ChatExport. Streams from /api/chat with the user's
// settings; ingests attachments via /api/fetch-url (URLs) and /api/ocr (images).

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/provider";
import { chat } from "@/i18n/dictionaries/chat";
import { ConversationSidebar } from "./ConversationSidebar";
import { SettingsPanel } from "./SettingsPanel";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";
import { ChatExport } from "./ChatExport";
import {
  DEFAULT_SETTINGS,
  type Attachment,
  type ChatMsg,
  type ChatSettings,
  type Conv,
} from "./types";

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now() + Math.random());

export function ChatClient() {
  const t = useT(chat);
  const [convs, setConvs] = useState<Conv[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [settings, setSettings] = useState<ChatSettings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void loadConvs();
    // Load model list + default model for the picker.
    fetch("/api/ollama/models")
      .then((r) => r.json())
      .then((d: { models?: string[] }) => {
        if (Array.isArray(d.models)) setModels(d.models);
      })
      .catch(() => {});
    fetch("/api/chat/info")
      .then((r) => r.json())
      .then((d: { model?: string }) => {
        if (d.model) setSettings((s) => ({ ...s, model: d.model! }));
      })
      .catch(() => {});
  }, []);

  async function loadConvs() {
    const r = await fetch("/api/conversations");
    const d = await r.json().catch(() => ({ conversations: [] }));
    setConvs(d.conversations ?? []);
  }

  async function openConv(id: string) {
    setActiveId(id);
    const r = await fetch(`/api/conversations/${id}`);
    const d = await r.json().catch(() => ({ messages: [] }));
    setMessages(
      (d.messages ?? []).map((m: { role: string; content: string; createdAt?: string }) => ({
        id: uid(),
        role: m.role === "user" ? "user" : "assistant",
        content: m.content,
        createdAt: m.createdAt ? new Date(m.createdAt).getTime() : undefined,
      })),
    );
  }

  function newConv() {
    setActiveId(null);
    setMessages([]);
    setAttachments([]);
  }

  async function deleteConv(id: string) {
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (activeId === id) newConv();
    void loadConvs();
  }

  async function renameConv(id: string, title: string) {
    await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    }).catch(() => {});
    setConvs((cs) => cs.map((c) => (c.id === id ? { ...c, title } : c)));
  }

  function setLastAssistant(prev: ChatMsg[], content: string): ChatMsg[] {
    const copy = [...prev];
    for (let i = copy.length - 1; i >= 0; i--) {
      if (copy[i].role === "assistant") {
        copy[i] = { ...copy[i], content };
        break;
      }
    }
    return copy;
  }

  // Prepend attachment text to the outgoing message so the model sees it.
  function withAttachments(text: string): string {
    if (!attachments.length) return text;
    const blocks = attachments
      .map((a) => `--- ${a.kind === "url" ? "URL" : "Tệp"}: ${a.name} ---\n${a.text}`)
      .join("\n\n");
    return `${blocks}\n\n${text}`;
  }

  const streamReply = useCallback(
    async (outgoing: string) => {
      setStreaming(true);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            conversationId: activeId ?? undefined,
            message: outgoing,
            model: settings.model,
            temperature: settings.temperature,
            topP: settings.topP,
            system: settings.system || undefined,
          }),
          signal: ctrl.signal,
        });
        const convId = res.headers.get("x-conversation-id");
        if (!res.ok || !res.body) {
          const errTxt = await res.text().catch(() => t("chat.errServer"));
          setMessages((p) => setLastAssistant(p, errTxt || t("chat.errServer")));
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
      } catch (e) {
        if ((e as Error)?.name !== "AbortError") {
          setMessages((p) => setLastAssistant(p, t("chat.errConn")));
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [activeId, settings, t],
  );

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    const outgoing = withAttachments(text);
    setInput("");
    setAttachments([]);
    setMessages((p) => [
      ...p,
      { id: uid(), role: "user", content: text, createdAt: Date.now() },
      { id: uid(), role: "assistant", content: "", createdAt: Date.now() },
    ]);
    await streamReply(outgoing);
  }

  function stop() {
    abortRef.current?.abort();
  }

  // --- message actions ---
  function onCopy(m: ChatMsg) {
    navigator.clipboard?.writeText(m.content).catch(() => {});
  }
  function onEdit(m: ChatMsg) {
    // Pull a user message back into the composer and drop it + everything after.
    if (m.role !== "user") return;
    const idx = messages.findIndex((x) => x.id === m.id);
    if (idx < 0) return;
    setInput(m.content);
    setMessages((p) => p.slice(0, idx));
  }
  function onDelete(m: ChatMsg) {
    setMessages((p) => p.filter((x) => x.id !== m.id));
  }
  async function onRegenerate(m: ChatMsg) {
    if (m.role !== "assistant" || streaming) return;
    const idx = messages.findIndex((x) => x.id === m.id);
    if (idx < 0) return;
    // Find the user message preceding this assistant reply.
    let userIdx = -1;
    for (let i = idx - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        userIdx = i;
        break;
      }
    }
    if (userIdx < 0) return;
    const userText = messages[userIdx].content;
    setMessages((p) => [
      ...p.slice(0, idx),
      { id: uid(), role: "assistant", content: "", createdAt: Date.now() },
    ]);
    await streamReply(userText);
  }

  // --- attachments ---
  async function onAddFiles(files: FileList) {
    for (const file of Array.from(files)) {
      const isImage = file.type.startsWith("image/");
      try {
        if (isImage) {
          const dataUrl = await readAsDataUrl(file);
          const r = await fetch("/api/ocr", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ image: dataUrl }),
          });
          const d = await r.json().catch(() => ({}));
          const text = r.ok ? (d.text ?? "") : `[OCR: ${d.error ?? "lỗi"}]`;
          pushAttachment(file.name, "image", text);
        } else {
          const text = await file.text();
          pushAttachment(file.name, "file", text);
        }
      } catch {
        pushAttachment(file.name, "file", "[không đọc được tệp]");
      }
    }
  }
  async function onAddUrl(url: string) {
    if (!url) return;
    try {
      const r = await fetch("/api/fetch-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const d = await r.json().catch(() => ({}));
      pushAttachment(d.title || url, "url", r.ok ? (d.text ?? "") : `[${d.error ?? "lỗi"}]`);
    } catch {
      pushAttachment(url, "url", "[không tải được URL]");
    }
  }
  function pushAttachment(name: string, kind: Attachment["kind"], text: string) {
    setAttachments((a) => [...a, { id: uid(), name, kind, chars: text.length, text }]);
  }
  function onRemoveAttachment(id: string) {
    setAttachments((a) => a.filter((x) => x.id !== id));
  }

  const activeTitle = convs.find((c) => c.id === activeId)?.title || "chat";

  return (
    <div className="flex h-[calc(100dvh-var(--header-h,56px))]">
      <aside className="hidden w-72 shrink-0 border-r border-neutral-200 sm:block dark:border-neutral-800">
        <ConversationSidebar
          convs={convs}
          activeId={activeId}
          query={query}
          onQuery={setQuery}
          onOpen={openConv}
          onNew={newConv}
          onDelete={deleteConv}
          onRename={renameConv}
        />
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            {t("chat.setTitle")}
          </button>
          <ChatExport messages={messages} title={activeTitle} />
        </div>

        {settingsOpen && (
          <div className="border-b border-neutral-200 p-4 dark:border-neutral-800">
            <SettingsPanel settings={settings} models={models} onChange={setSettings} />
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-6">
            <MessageList
              messages={messages}
              streaming={streaming}
              onCopy={onCopy}
              onEdit={onEdit}
              onRegenerate={onRegenerate}
              onDelete={onDelete}
            />
          </div>
        </div>

        <div className="border-t border-neutral-200 p-3 dark:border-neutral-800">
          <div className="mx-auto max-w-3xl">
            <Composer
              value={input}
              onChange={setInput}
              onSend={send}
              onStop={stop}
              streaming={streaming}
              attachments={attachments}
              onAddFiles={onAddFiles}
              onAddUrl={onAddUrl}
              onRemoveAttachment={onRemoveAttachment}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}
