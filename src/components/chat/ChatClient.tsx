"use client";

// Chat orchestrator (Wave 3 integration). Owns all chat state + handlers and
// composes the presentational pieces: ConversationSidebar, SettingsPanel,
// MessageList, Composer, ChatExport. Streams from /api/chat with the user's
// settings; ingests attachments via /api/fetch-url (URLs) and /api/ocr (images).

import { useCallback, useEffect, useRef, useState } from "react";
import { PanelLeft, SlidersHorizontal, BarChart3, Navigation, MapPin, CloudSun } from "lucide-react";
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
import { splitFrames, type ChatFrame } from "@/lib/chat/frames";
import type { ToolTraceItem } from "./toolLabel";

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now() + Math.random());

// Empty-state sample prompts — one per local-model tool capability (chart /
// directions / nearby / weather). Keys resolve via the chat dictionary.
const SAMPLE_PROMPTS = [
  { key: "chat.suggest4", Icon: BarChart3 }, // vẽ chart
  { key: "chat.suggest5", Icon: Navigation }, // dẫn đường
  { key: "chat.suggestNearby", Icon: MapPin }, // tìm quanh đây
  { key: "chat.suggestWeather", Icon: CloudSun }, // thời tiết
] as const;

export function ChatClient() {
  const t = useT(chat);
  const [convs, setConvs] = useState<Conv[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [settings, setSettings] = useState<ChatSettings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [convOpen, setConvOpen] = useState(false);
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
      (d.messages ?? []).map(
        (m: {
          role: string;
          content: string;
          createdAt?: string;
          tokensIn?: number;
          tokensOut?: number;
        }) => ({
          id: uid(),
          role: m.role === "user" ? "user" : "assistant",
          content: m.content,
          createdAt: m.createdAt ? new Date(m.createdAt).getTime() : undefined,
          tokensIn: m.tokensIn,
          tokensOut: m.tokensOut,
        }),
      ),
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

  function setLastAssistant(
    prev: ChatMsg[],
    content: string,
    tokens?: { tokensIn: number; tokensOut: number },
    toolTrace?: ToolTraceItem[],
    cites?: string[],
  ): ChatMsg[] {
    const copy = [...prev];
    for (let i = copy.length - 1; i >= 0; i--) {
      if (copy[i].role === "assistant") {
        copy[i] = {
          ...copy[i],
          content,
          ...(tokens ?? {}),
          ...(toolTrace !== undefined ? { toolTrace } : {}),
          ...(cites !== undefined ? { cites } : {}),
        };
        break;
      }
    }
    return copy;
  }

  // Prepend attachment text to the outgoing message so the model sees it.
  function withAttachments(text: string): string {
    if (!attachments.length) return text;
    const clean = (s: string) => s.replace(/\x1e/g, ""); // strip SEP (defense-in-depth D-SP4-2)
    const blocks = attachments
      .map((a) => `--- ${a.kind === "url" ? "URL" : "Tệp"}: ${a.name} ---\n${clean(a.text)}`)
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
        let raw = "";
        const trace = new Map<number, ToolTraceItem>();
        let cites: string[] | undefined;
        let tokens: { tokensIn: number; tokensOut: number } | undefined;
        const applyFrames = (frames: ChatFrame[]) => {
          for (const f of frames) {
            if (f.t === "tool") {
              const cur = trace.get(f.c) ?? { c: f.c, name: f.name, done: false };
              if (f.phase === "call") { cur.name = f.name; cur.args = f.args; }
              else { cur.ok = f.ok; cur.done = true; }
              trace.set(f.c, cur);
            } else if (f.t === "cite") cites = f.names;
            else if (f.t === "tokens") tokens = { tokensIn: f.i, tokensOut: f.o };
          }
        };
        const items = () => [...trace.values()].sort((a, b) => a.c - b.c);
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          raw += dec.decode(value, { stream: true });
          const { text, frames } = splitFrames(raw);
          applyFrames(frames);
          const list = items();
          setMessages((p) => setLastAssistant(p, text, undefined, list.length ? list : undefined, cites));
        }
        const fin = splitFrames(raw);
        applyFrames(fin.frames);
        const list = items();
        setMessages((p) => setLastAssistant(p, fin.text, tokens, list.length ? list : undefined, cites));
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
      {/* Static conversation sidebar on tablet/desktop (sm+) */}
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

      {/* Mobile slide-in conversation drawer (<sm). Opened from the top-bar button. */}
      {convOpen && (
        <div className="fixed inset-0 z-40 flex sm:hidden">
          <button
            type="button"
            aria-label={t("chat.histListAria")}
            onClick={() => setConvOpen(false)}
            className="anim-fade-in absolute inset-0 bg-black/40"
          />
          <div className="anim-slide-in-left relative z-10 flex h-full w-[84%] max-w-xs flex-col bg-white shadow-xl dark:bg-neutral-950">
            <ConversationSidebar
              convs={convs}
              activeId={activeId}
              query={query}
              onQuery={setQuery}
              onOpen={(id) => {
                openConv(id);
                setConvOpen(false);
              }}
              onNew={() => {
                newConv();
                setConvOpen(false);
              }}
              onDelete={deleteConv}
              onRename={renameConv}
            />
          </div>
        </div>
      )}

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-3 py-2 sm:px-4 dark:border-neutral-800">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button
              type="button"
              onClick={() => setConvOpen(true)}
              aria-label={t("chat.histTitle")}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-neutral-300 text-neutral-600 hover:bg-neutral-50 sm:hidden dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <PanelLeft size={18} aria-hidden />
            </button>
            <button
              onClick={() => setSettingsOpen((v) => !v)}
              aria-label={t("chat.setTitle")}
              title={t("chat.setTitle")}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 sm:px-3 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              <SlidersHorizontal size={16} className="sm:hidden" aria-hidden />
              <span className="hidden sm:inline">{t("chat.setTitle")}</span>
            </button>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-500 sm:hidden">
              {activeTitle}
            </span>
          </div>
          <ChatExport messages={messages} title={activeTitle} />
        </div>

        {settingsOpen && (
          <div className="anim-slide-down border-b border-neutral-200 p-4 dark:border-neutral-800">
            <SettingsPanel settings={settings} models={models} onChange={setSettings} />
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center px-4 py-8 text-center">
              <h2 className="mb-1 text-lg font-bold tracking-tight">{t("chat.emptyTitle")}</h2>
              <p className="mb-5 text-sm leading-relaxed text-neutral-500">{t("chat.empty")}</p>
              <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                {SAMPLE_PROMPTS.map(({ key, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setInput(t(key))}
                    className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white/60 px-3 py-2.5 text-left text-sm text-neutral-700 transition hover:border-[var(--color-accent)] hover:bg-white dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-200 dark:hover:bg-neutral-900"
                  >
                    <Icon size={16} className="shrink-0 text-[var(--color-accent)]" aria-hidden />
                    <span className="line-clamp-2">{t(key)}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl px-3 py-5 sm:px-4 sm:py-6">
              <MessageList
                messages={messages}
                streaming={streaming}
                onCopy={onCopy}
                onEdit={onEdit}
                onRegenerate={onRegenerate}
                onDelete={onDelete}
              />
            </div>
          )}
        </div>

        <div className="border-t border-neutral-200 px-3 pt-3 pb-[calc(0.75rem+4.75rem+env(safe-area-inset-bottom))] sm:px-4 md:pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:border-neutral-800">
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
