"use client";

// Chat orchestrator (Wave 3 integration). Owns all chat state + handlers and
// composes the presentational pieces: ConversationSidebar, SettingsPanel,
// MessageList, Composer, ChatExport. Streams from /api/chat with the user's
// settings; ingests attachments via /api/fetch-url (URLs) and /api/ocr (images).

import { useCallback, useEffect, useRef, useState } from "react";
import { PanelLeft, SlidersHorizontal, BarChart3, Navigation, MapPin, CloudSun, ArrowDown } from "lucide-react";
import { useT } from "@/i18n/provider";
import { chat } from "@/i18n/dictionaries/chat";
import { ConversationSidebar } from "./ConversationSidebar";
import { SettingsPanel } from "./SettingsPanel";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";
import { ChatExport } from "./ChatExport";
import { ProactiveCard, type ProactiveAlertView } from "./ProactiveCard";
import { loadDismissed, dismissAlerts } from "./proactiveDismiss";
import {
  DEFAULT_SETTINGS,
  type Attachment,
  type ChatMsg,
  type ChatSettings,
  type Conv,
  type PendingWrite,
  type ToolPick,
} from "./types";
import type { CatalogGroup, CatalogTool } from "@/lib/chat/toolCatalog";
import { splitFrames, type ChatFrame } from "@/lib/chat/frames";
import { isPdfFile, isDocxFile, looksBinaryText, stripNul } from "@/lib/chat/attach";
import type { AttachmentMeta } from "@/lib/chat/attachment-meta";
import { MAX_RAW_IMAGES, rawImageVerdict } from "./imageCap";
import type { ToolTraceItem } from "./toolLabel";

// C2: Estimated pricing for Claude models (USD per million tokens in/out).
// Source: claude-api skill cache 2026-05-26. Used for header cost hint ONLY —
// NOT per-message (chat_message has no model column in MVS; Rule 12 fail-loud).
const CLAUDE_PRICING: Record<string, { in: number; out: number }> = {
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-opus-4-8": { in: 5, out: 25 },
};

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
  const [convsLoaded, setConvsLoaded] = useState(false); // U-minor: avoid "no conversations" flash before first load
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [settings, setSettings] = useState<ChatSettings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [convOpen, setConvOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false); // F1: /xuat opens the export menu
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [imgNotice, setImgNotice] = useState<string | null>(null); // W3 vision: cap ảnh raw → notice
  const [models, setModels] = useState<string[]>([]);
  const [claudeModels, setClaudeModels] = useState<string[]>([]); // C2: from /api/chat/info
  const [customAgents, setCustomAgents] = useState<{ id: string; name: string }[]>([]); // P3: persona presets
  const [ocrAvailable, setOcrAvailable] = useState(true); // F3/FEAT-4: degrade if tesseract missing
  const [toolGroups, setToolGroups] = useState<CatalogGroup[]>([]); // P1 quick-tools catalog
  const [toolPick, setToolPick] = useState<ToolPick | null>(null); // P1: tool user đã chọn (ephemeral)
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Conv[]>([]); // FEAT-1: content-search hits
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true); // dính đáy: auto-scroll khi user đang ở cuối
  const programmaticRef = useRef(false); // true khi *mình* tự cuộn → onScroll bỏ qua echo
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [proactive, setProactive] = useState<ProactiveAlertView[]>([]); // FEAT-2: system alert banner

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
      .then((d: { model?: string; claudeModels?: string[] }) => {
        if (d.model) setSettings((s) => ({ ...s, model: d.model! }));
        // C2: expose Claude model whitelist to the picker; empty array = no Claude key.
        if (Array.isArray(d.claudeModels)) setClaudeModels(d.claudeModels);
      })
      .catch(() => {});
    // Probe OCR once so the composer can warn up front instead of failing an
    // image upload after the fact (F3/FEAT-4).
    fetch("/api/ocr")
      .then((r) => r.json())
      .then((d: { available?: boolean }) => setOcrAvailable(d.available !== false))
      .catch(() => {});
    // P1 quick-tools: catalog tool per-user cho slash-picker.
    fetch("/api/chat/tools")
      .then((r) => r.json())
      .then((d: { groups?: CatalogGroup[] }) => {
        if (Array.isArray(d.groups)) setToolGroups(d.groups);
      })
      .catch(() => {});
    // P3 chat persona: user's saved custom agents for the persona picker.
    fetch("/api/custom-agents")
      .then((r) => r.json())
      .then((d: { agents?: { id: string; name: string }[] }) => {
        if (Array.isArray(d.agents)) setCustomAgents(d.agents.map((a) => ({ id: a.id, name: a.name })));
      })
      .catch(() => {});
  }, []);

  // P3 chat persona: restore the last-used agent (localStorage) and honor an
  // ?agent=<id> deep-link from the Custom Agents page (the deep-link wins). A stale
  // id is harmless — the backend falls back to the default persona (fail-soft).
  useEffect(() => {
    let restored: string | null = null;
    try {
      restored =
        new URLSearchParams(window.location.search).get("agent") ||
        localStorage.getItem("laam:chat:agent");
    } catch {
      /* no window/storage — ignore */
    }
    if (restored) setSettings((s) => ({ ...s, customAgentId: restored! }));
  }, []);

  // P3 chat persona: persist the selection so it survives reloads.
  useEffect(() => {
    try {
      if (settings.customAgentId) localStorage.setItem("laam:chat:agent", settings.customAgentId);
      else localStorage.removeItem("laam:chat:agent");
    } catch {
      /* ignore */
    }
  }, [settings.customAgentId]);

  // Auto-scroll xuống tin nhắn cuối khi messages đổi (gửi / streaming) nếu đang dính đáy.
  useEffect(() => {
    if (stickRef.current) scrollToBottom("auto");
  }, [messages]);

  // FEAT-1 content search: debounce the query → /api/conversations?q= (title OR
  // message content). Empty query clears the hits (sidebar falls back to the list).
  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setSearchResults([]);
      return;
    }
    const id = setTimeout(() => {
      fetch(`/api/conversations?q=${encodeURIComponent(term)}`)
        .then((r) => r.json())
        .then((d: { conversations?: Conv[] }) => setSearchResults(d.conversations ?? []))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(id);
  }, [query]);

  function scrollToBottom(behavior: ScrollBehavior = "smooth") {
    const el = scrollRef.current;
    if (el) {
      // Đánh dấu: event `scroll` sắp tới là do mình tự cuộn (không phải user).
      programmaticRef.current = true;
      el.scrollTo({ top: el.scrollHeight, behavior });
      // Xoá cờ ở frame kế — sau khi event scroll lập trình đã bắn xong.
      requestAnimationFrame(() => {
        programmaticRef.current = false;
      });
    }
    stickRef.current = true;
    setShowScrollBtn(false);
  }

  // Theo dõi vị trí cuộn: gần đáy thì vẫn dính (auto-scroll), xa đáy thì hiện nút.
  function onScroll() {
    // Bỏ qua echo từ scroll lập trình của chính mình. Nếu không, khi streaming
    // (scrollHeight đang lớn dần) dist đo được nhất thời >200 → setShowScrollBtn
    // dao động với effect [messages] → "Maximum update depth exceeded".
    if (programmaticRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickRef.current = dist < 80;
    // UX-4: show the jump-to-bottom button whenever the user is out of the
    // auto-stick zone (was 200px → short replies never crossed it).
    setShowScrollBtn(dist > 80);
  }

  async function loadConvs() {
    const r = await fetch("/api/conversations");
    const d = await r.json().catch(() => ({ conversations: [] }));
    setConvs(d.conversations ?? []);
    setConvsLoaded(true);
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
          attachments?: AttachmentMeta[] | null;
        }) => ({
          id: uid(),
          role: m.role === "user" ? "user" : "assistant",
          content: m.content,
          createdAt: m.createdAt ? new Date(m.createdAt).getTime() : undefined,
          tokensIn: m.tokensIn,
          tokensOut: m.tokensOut,
          ...(m.attachments?.length ? { attachments: m.attachments } : {}),
        }),
      ),
    );
  }

  function newConv() {
    setActiveId(null);
    setMessages([]);
    setAttachments([]);
  }

  // F1 /xoa — clear the current conversation's content. If it is persisted,
  // delete it server-side (deleteConv resets the view); otherwise just reset
  // the local draft. Distinct from /moi, which keeps the old conv in history.
  function clearConv() {
    if (activeId) void deleteConv(activeId);
    else newConv();
  }

  async function deleteConv(id: string) {
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (activeId === id) newConv();
    void loadConvs();
  }

  // FEAT-1: bulk-delete the selected conversations (one DELETE each — no bulk
  // endpoint needed). Resets the view if the open conversation was removed.
  async function bulkDelete(ids: string[]) {
    await Promise.all(
      ids.map((id) => fetch(`/api/conversations/${id}`, { method: "DELETE" }).catch(() => {})),
    );
    if (activeId && ids.includes(activeId)) newConv();
    void loadConvs();
  }

  // S1: re-derive every conversation whose title leaked attachment bytes.
  async function cleanupTitles() {
    await fetch("/api/conversations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "backfill-titles" }),
    }).catch(() => {});
    void loadConvs();
  }

  // S9: re-derive ONE conversation's title from its first user message.
  async function smartRename(id: string) {
    const r = await fetch("/api/conversations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "retitle", id }),
    }).catch(() => null);
    const d = r && r.ok ? await r.json().catch(() => null) : null;
    if (d?.title) setConvs((cs) => cs.map((c) => (c.id === id ? { ...c, title: d.title } : c)));
    else void loadConvs();
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
    pendingWrite?: PendingWrite,
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
          ...(pendingWrite !== undefined ? { pendingWrite } : {}),
        };
        break;
      }
    }
    return copy;
  }

  // SP-2 write-gate: update the confirm-card status on a specific message by id
  // (the card lives on the assistant message that proposed the write).
  function setPendingStatus(prev: ChatMsg[], msgId: string, status: PendingWrite["status"]): ChatMsg[] {
    return prev.map((m) =>
      m.id === msgId && m.pendingWrite ? { ...m, pendingWrite: { ...m.pendingWrite, status } } : m,
    );
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

  // Generic POST + stream to /api/chat. body = {message} for a normal turn, or
  // {confirm:{token,approve}} for the write-gate round-trip. Streams text + frames
  // into the LAST assistant message; returns whether it completed ok.
  const streamFrom = useCallback(
    async (body: Record<string, unknown>): Promise<boolean> => {
      setStreaming(true);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        const convId = res.headers.get("x-conversation-id");
        if (!res.ok || !res.body) {
          const errTxt = await res.text().catch(() => t("chat.errServer"));
          setMessages((p) => setLastAssistant(p, errTxt || t("chat.errServer")));
          return false;
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let raw = "";
        const trace = new Map<number, ToolTraceItem>();
        let cites: string[] | undefined;
        let tokens: { tokensIn: number; tokensOut: number } | undefined;
        let pendingWrite: PendingWrite | undefined;
        const applyFrames = (frames: ChatFrame[]) => {
          for (const f of frames) {
            if (f.t === "tool") {
              const cur = trace.get(f.c) ?? { c: f.c, name: f.name, done: false };
              if (f.phase === "call") { cur.name = f.name; cur.args = f.args; }
              else { cur.ok = f.ok; cur.done = true; }
              trace.set(f.c, cur);
            } else if (f.t === "cite") cites = f.names;
            else if (f.t === "proactive") {
              // FEAT-2 + S2: surface as a banner, minus alerts the user dismissed (24h).
              const dismissed = loadDismissed(Date.now());
              setProactive(f.alerts.filter((a) => !dismissed.has(a.key)));
            }
            else if (f.t === "tokens") tokens = { tokensIn: f.i, tokensOut: f.o };
            else if (f.t === "pending_write")
              pendingWrite = {
                token: f.token, tool: f.tool, title: f.title,
                summary: f.summary, fields: f.fields, status: "idle",
              };
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
          setMessages((p) => setLastAssistant(p, text, undefined, list.length ? list : undefined, cites, pendingWrite));
        }
        const fin = splitFrames(raw);
        applyFrames(fin.frames);
        const list = items();
        setMessages((p) => setLastAssistant(p, fin.text, tokens, list.length ? list : undefined, cites, pendingWrite));
        if (!activeId && convId) setActiveId(convId);
        void loadConvs();
        return true;
      } catch (e) {
        if ((e as Error)?.name !== "AbortError") {
          setMessages((p) => setLastAssistant(p, t("chat.errConn")));
        }
        return false;
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [activeId, t],
  );

  const streamReply = useCallback(
    (outgoing: string, titleHint?: string, images?: string[], attachments?: AttachmentMeta[], requestedTool?: { name: string; args: Record<string, unknown> }) =>
      streamFrom({
        conversationId: activeId ?? undefined,
        message: outgoing,
        // F4: the raw user text titles a new conversation, not the attachment-
        // prefixed `outgoing` (which can begin with a file's raw bytes).
        titleHint,
        // P1 quick-tools: tool user đã chọn → server pre-dispatch deterministic.
        ...(requestedTool ? { requestedTool } : {}),
        // W3 vision: kênh ảnh raw (base64) — additive; vắng → body y như cũ.
        ...(images && images.length ? { images } : {}),
        // Preview metadata để PERSIST (hiện lại sau reload) — additive.
        ...(attachments && attachments.length ? { attachments } : {}),
        model: settings.model,
        temperature: settings.temperature,
        topP: settings.topP,
        system: settings.system || undefined,
        // P3 chat persona: selected custom-agent preset (per-user, fail-soft server-side).
        customAgentId: settings.customAgentId || undefined,
      }),
    [streamFrom, activeId, settings],
  );

  // Write-gate round-trip: confirm/deny a proposed write. Disables the card
  // (status "sending"), POSTs {confirm} reusing the stream helper into a NEW
  // assistant message, then resolves the card. The status guard + the backend's
  // nonce dedupe together prevent double-submit.
  async function handleConfirm(msgId: string, approve: boolean) {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg?.pendingWrite || msg.pendingWrite.status !== "idle" || streaming) return;
    const token = msg.pendingWrite.token;
    setMessages((p) => setPendingStatus(p, msgId, "sending"));
    setMessages((p) => [...p, { id: uid(), role: "assistant", content: "", createdAt: Date.now() }]);
    const ok = await streamFrom({ conversationId: activeId ?? undefined, confirm: { token, approve } });
    setMessages((p) => setPendingStatus(p, msgId, ok ? (approve ? "done" : "cancelled") : "error"));
  }

  // UX-1: send arbitrary text (used by both the composer and one-click sample
  // prompts) so a sample sends immediately instead of just filling the input.
  async function sendMessage(rawText: string) {
    // P1 quick-tools: toolPick + text rỗng → message mặc định (server đòi non-empty);
    // còn thiếu required-arg thì Composer đã disable nút gửi.
    const text = rawText.trim() || (toolPick ? t("chat.toolDefaultMsg", { name: toolPick.tool.name }) : "");
    if (!text || streaming) return;
    const requested = toolPick
      ? {
          name: toolPick.tool.name,
          // Bỏ giá trị rỗng/undefined/NaN — chỉ gửi args user thật sự nhập hợp lệ.
          args: Object.fromEntries(
            Object.entries(toolPick.args).filter(
              ([, v]) =>
                v !== undefined &&
                v !== null &&
                !(typeof v === "string" && v.trim() === "") &&
                !(typeof v === "number" && Number.isNaN(v)),
            ),
          ),
        }
      : undefined;
    setToolPick(null); // 1 lượt 1 tool — không dính sang lượt sau
    const outgoing = withAttachments(text);
    // W3 vision: thu ảnh raw TRƯỚC khi xoá attachments. slice = defense-in-depth
    // (cap đã enforce lúc đính kèm) để không bao giờ vượt trần server (400).
    const images = attachments
      .filter((a): a is Attachment & { b64: string } => !!a.b64)
      .slice(0, MAX_RAW_IMAGES)
      .map((a) => a.b64);
    // Preview metadata: PERSIST + render lại sau reload (thumbnail + name/size),
    // tách khỏi text đã prepend vào message. Server sanitize lại (trust boundary).
    const metas: AttachmentMeta[] = attachments.map((a) => ({
      name: a.name,
      kind: a.kind,
      ...(a.mime ? { mime: a.mime } : {}),
      ...(typeof a.size === "number" ? { size: a.size } : {}),
      ...(a.preview ? { preview: a.preview } : {}),
    }));
    setInput("");
    setAttachments([]);
    setImgNotice(null);
    stickRef.current = true; // gửi → luôn cuộn xuống cuối
    setMessages((p) => [
      ...p,
      {
        id: uid(),
        role: "user",
        content: text,
        createdAt: Date.now(),
        ...(metas.length ? { attachments: metas } : {}),
      },
      { id: uid(), role: "assistant", content: "", createdAt: Date.now() },
    ]);
    await streamReply(outgoing, text, images, metas, requested);
  }

  function send() {
    void sendMessage(input);
  }

  // P1 quick-tools: chọn/bỏ tool + nhập args (state ở đây để send() đọc được).
  function onToolPick(pick: { tool: CatalogTool; groupLabel: string } | null) {
    setToolPick(pick ? { ...pick, args: {} } : null);
  }
  function onToolArg(key: string, value: unknown) {
    setToolPick((p) => (p ? { ...p, args: { ...p.args, [key]: value } } : p));
  }
  // Review-fix (UX): Claude MVS không tool → /api/chat sẽ 400 requestedTool. Ẩn
  // section Công cụ + clear pick khi đổi sang Claude — đừng để user chọn rồi vỡ lúc gửi.
  const claudeSelected = settings.model.startsWith("claude");
  useEffect(() => {
    if (claudeSelected) setToolPick(null);
  }, [claudeSelected]);

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
    setImgNotice(null);
    // W3 vision: đếm ảnh raw đã giữ b64 (state + ảnh thêm trong chính vòng này).
    let rawCount = attachments.filter((a) => a.b64).length;
    for (const file of Array.from(files)) {
      const isImage = file.type.startsWith("image/");
      try {
        if (isImage) {
          // W3 vision: giữ base64 (bỏ prefix data:) cho kênh ảnh raw, SONG SONG
          // với OCR-text prefix như cũ. Vượt cap (2 ảnh × 2MB sau encode — VRAM
          // 16GB, CHAT_NUM_CTX=16384, xem imageCap.ts) → notice i18n + chỉ dùng
          // đường OCR-text (không giữ b64).
          const dataUrl = await readAsDataUrl(file);
          const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
          // Preview thumbnail (downscale qua canvas cơ bản — chạy mọi trình duyệt,
          // KHÔNG phải pdfjs) để hiện lại sau reload mà không lưu cả ảnh gốc.
          const imgExtra = { preview: await makeThumb(dataUrl), mime: file.type, size: file.size };
          const verdict = rawImageVerdict(rawCount, b64.length);
          if (verdict === "ok") rawCount++;
          else
            setImgNotice(
              t(verdict === "count" ? "chat.imgCapCount" : "chat.imgCapSize", { name: file.name }),
            );
          const keepB64 = verdict === "ok" ? b64 : undefined;
          // OCR known-unavailable → attach with a clear note, skip the doomed call.
          if (!ocrAvailable) {
            pushAttachment(file.name, "image", `[${t("chat.ocrOffAttach")}]`, keepB64, imgExtra);
            continue;
          }
          const r = await fetch("/api/ocr", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ image: dataUrl }),
          });
          const d = await r.json().catch(() => ({}));
          const text = r.ok ? (d.text ?? "") : `[OCR: ${d.error ?? "lỗi"}]`;
          pushAttachment(file.name, "image", text, keepB64, imgExtra);
        } else if (isPdfFile(file.name, file.type)) {
          // PDF: parse Ở SERVER (poppler + tesseract, xem /api/pdf) — chạy y hệt mọi
          // thiết bị, không phụ thuộc pdfjs/trình duyệt (pdfjs v6 vỡ trên Safari/iOS).
          // Server trả PdfTierResult; ta xử lý text|ocr|vision như cũ.
          const fd = new FormData();
          fd.append("file", file);
          fd.append("visionMax", String(Math.max(0, MAX_RAW_IMAGES - rawCount)));
          const r = await fetch("/api/pdf", { method: "POST", body: fd });
          const res = await r.json().catch(() => ({}) as Record<string, unknown>);
          // Preview = thumbnail trang 1 do server render (res.thumb); hiện lại sau reload.
          const pdfExtra = {
            preview: typeof res.thumb === "string" ? res.thumb : undefined,
            mime: "application/pdf",
            size: file.size,
          };
          if (!r.ok) {
            // Fail loud: server đã kèm lý do thật (Rule 12).
            pushAttachment(file.name, "file", `[${String(res.error ?? t("chat.errServer"))}]`, undefined, pdfExtra);
          } else if (res.via === "text" || res.via === "ocr") {
            pushAttachment(file.name, "file", stripNul(String(res.text ?? "")), undefined, pdfExtra);
          } else if (res.via === "vision") {
            // Chốt chặn cuối: đẩy ảnh trang vào kênh vision để model ĐỌC TRỰC TIẾP (cap 2×2MB).
            let pushed = 0;
            for (const img of (res.images as string[]) ?? []) {
              const b64 = img.slice(img.indexOf(",") + 1);
              const verdict = rawImageVerdict(rawCount, b64.length);
              if (verdict === "ok") {
                pushAttachment(file.name, "image", `[${t("chat.pdfVisionNote")}]`, b64, pdfExtra);
                rawCount++;
                pushed++;
              } else {
                setImgNotice(t(verdict === "count" ? "chat.imgCapCount" : "chat.imgCapSize", { name: file.name }));
              }
            }
            if (!pushed) pushAttachment(file.name, "file", `[${t("chat.ocrPdfEmpty")}]`, undefined, pdfExtra);
          } else {
            pushAttachment(file.name, "file", `[${t("chat.ingPdfNoText")}]`, undefined, pdfExtra);
          }
        } else if (isDocxFile(file.name, file.type)) {
          // .docx: bóc text Ở SERVER (unzip + parse word/document.xml, xem /api/docx)
          // — KHÔNG đọc nhị phân phía client (ra rác NUL).
          const fd = new FormData();
          fd.append("file", file);
          const r = await fetch("/api/docx", { method: "POST", body: fd });
          const res = await r.json().catch(() => ({}) as Record<string, unknown>);
          const docxExtra = {
            mime: file.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            size: file.size,
          };
          if (!r.ok) {
            pushAttachment(file.name, "file", `[${String(res.error ?? t("chat.errServer"))}]`, undefined, docxExtra);
          } else {
            const text = stripNul(String(res.text ?? "")).trim();
            pushAttachment(file.name, "file", text || `[${t("chat.docxNoText")}]`, undefined, docxExtra);
          }
        } else {
          const raw = await file.text();
          // File nhị phân khác (docx/zip/ảnh sai-mime) cũng ra rác có NUL → báo rõ thay vì gửi.
          pushAttachment(
            file.name,
            "file",
            looksBinaryText(raw) ? `[${t("chat.fileBinaryUnsupported")}]` : stripNul(raw),
            undefined,
            { mime: file.type, size: file.size },
          );
        }
      } catch (err) {
        // Fail loud (AGENTS.md Rule 12): surface the real reason instead of swallowing it,
        // so attach failures (network, OCR, file read) are diagnosable from the model
        // reply + browser console instead of an opaque "không đọc được tệp".
        const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        console.error("[chat] attach failed:", file.name, err);
        pushAttachment(file.name, "file", `[không đọc được tệp: ${reason}]`);
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
  function pushAttachment(
    name: string,
    kind: Attachment["kind"],
    text: string,
    b64?: string,
    extra?: { preview?: string; mime?: string; size?: number },
  ) {
    setAttachments((a) => [
      ...a,
      { id: uid(), name, kind, chars: text.length, text, ...(b64 ? { b64 } : {}), ...extra },
    ]);
  }
  function onRemoveAttachment(id: string) {
    setAttachments((a) => a.filter((x) => x.id !== id));
  }

  const activeTitle = convs.find((c) => c.id === activeId)?.title || "chat";
  // U2/UX-3: show the real deployed model (from /api/chat/info) instead of a
  // hardcoded "Gemma"; neutral fallback until it loads.
  const modelName = settings.model || t("chat.modelFallback");
  // FEAT-1: while searching, show the server's content-search hits; otherwise the
  // full list. serverFiltered tells the sidebar not to re-filter by title.
  const searching = query.trim().length > 0;
  const sidebarConvs = searching ? searchResults : convs;
  // S7: running token total for the active conversation (local model → free).
  const totalTokens = messages.reduce((s, m) => s + (m.tokensIn ?? 0) + (m.tokensOut ?? 0), 0);
  // C2: whether the currently-selected model is a Claude API model.
  const isCurrentClaude = claudeModels.includes(settings.model);
  // C2: estimated cost for the current conversation when a Claude model is selected.
  // In/out ARE tracked per message (tokensIn/tokensOut from the {t:"tokens"} frame +
  // DB columns) — use the real split. "Ước tính" remains because MODEL attribution is
  // approximate (no model column in chat_message for MVS): older turns may have run
  // on a different/local model.
  const estUsd: string | null = (() => {
    if (!isCurrentClaude || totalTokens === 0) return null;
    const pricing = CLAUDE_PRICING[settings.model];
    if (!pricing) return null;
    const totalIn = messages.reduce((s, m) => s + (m.tokensIn ?? 0), 0);
    const totalOut = messages.reduce((s, m) => s + (m.tokensOut ?? 0), 0);
    const cost = (totalIn * pricing.in + totalOut * pricing.out) / 1_000_000;
    return cost.toFixed(4);
  })();

  return (
    <div className="flex h-[calc(100dvh-var(--header-h,56px))]">
      {/* Static conversation sidebar on tablet/desktop (sm+) */}
      <aside className="hidden w-72 shrink-0 border-r border-neutral-200 sm:block dark:border-neutral-800">
        <ConversationSidebar
          convs={sidebarConvs}
          loading={!convsLoaded}
          serverFiltered={searching}
          activeId={activeId}
          query={query}
          onQuery={setQuery}
          onOpen={openConv}
          onNew={newConv}
          onDelete={deleteConv}
          onBulkDelete={bulkDelete}
          onRename={renameConv}
          onCleanup={cleanupTitles}
          onSmartRename={smartRename}
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
              convs={sidebarConvs}
              loading={!convsLoaded}
              serverFiltered={searching}
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
              onBulkDelete={bulkDelete}
              onRename={renameConv}
              onCleanup={cleanupTitles}
              onSmartRename={smartRename}
            />
          </div>
        </div>
      )}

      <section className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2 px-3 py-2 sm:px-4">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button
              type="button"
              onClick={() => setConvOpen(true)}
              aria-label={t("chat.histTitle")}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-neutral-600 hover:bg-neutral-100 sm:hidden dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <PanelLeft size={18} aria-hidden />
            </button>
            <button
              onClick={() => setSettingsOpen((v) => !v)}
              aria-label={t("chat.setTitle")}
              title={t("chat.setTitle")}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 sm:px-3 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              <SlidersHorizontal size={16} className="sm:hidden" aria-hidden />
              <span className="hidden sm:inline">{t("chat.setTitle")}</span>
            </button>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-500 sm:hidden">
              {activeTitle}
            </span>
          </div>
          {totalTokens > 0 && (
            <span
              className="hidden shrink-0 text-xs text-neutral-400 sm:inline"
              title={
                estUsd
                  ? t("chat.expTotalTokensClaude", { n: totalTokens, usd: estUsd })
                  : t("chat.expTotalTokens", { n: totalTokens })
              }
            >
              {estUsd
                ? t("chat.expTotalTokensClaude", { n: totalTokens, usd: estUsd })
                : t("chat.expTotalTokens", { n: totalTokens })}
            </span>
          )}
          <ChatExport messages={messages} title={activeTitle} open={exportOpen} onOpenChange={setExportOpen} />
        </div>

        {proactive.length > 0 && (
          <div className="px-3 pt-2 sm:px-4">
            <ProactiveCard
              alerts={proactive}
              onDismiss={() => {
                dismissAlerts(proactive.map((a) => a.key), Date.now()); // S2: remember dismissal (24h)
                setProactive([]);
              }}
            />
          </div>
        )}

        {settingsOpen && (
          <div className="anim-slide-down p-4">
            <SettingsPanel settings={settings} models={models} claudeModels={claudeModels} customAgents={customAgents} onChange={setSettings} />
          </div>
        )}

        <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center px-4 py-8 text-center">
              <h2 className="mb-1 text-lg font-bold tracking-tight">{t("chat.emptyTitle")}</h2>
              <p className="mb-5 text-sm leading-relaxed text-neutral-500">{t("chat.empty", { model: modelName })}</p>
              <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                {SAMPLE_PROMPTS.map(({ key, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => void sendMessage(t(key))}
                    className="flex items-center gap-2 rounded-xl bg-neutral-100/70 px-3 py-2.5 text-left text-sm text-neutral-700 transition hover:bg-neutral-100 dark:bg-neutral-900/60 dark:text-neutral-200 dark:hover:bg-neutral-800"
                  >
                    <Icon size={16} className="shrink-0 text-[var(--color-accent)]" aria-hidden />
                    <span className="line-clamp-2">{t(key)}</span>
                  </button>
                ))}
              </div>

              {/* UX-6: jump back into a recent conversation from the empty state. */}
              {convs.length > 0 && (
                <div className="mt-6 w-full text-left">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                    {t("chat.recentTitle")}
                  </div>
                  <div className="flex flex-col gap-1">
                    {convs.slice(0, 4).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => openConv(c.id)}
                        className="truncate rounded-lg px-3 py-2 text-left text-sm text-neutral-600 transition hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                      >
                        {c.title?.trim() || t("chat.histUntitled")}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="mx-auto max-w-3xl px-3 pt-5 pb-40 sm:px-4 sm:pt-6 sm:pb-36">
              <MessageList
                messages={messages}
                streaming={streaming}
                onCopy={onCopy}
                onEdit={onEdit}
                onRegenerate={onRegenerate}
                onDelete={onDelete}
                onConfirm={handleConfirm}
              />
            </div>
          )}
        </div>

        {/* Floating composer (item 4 — không gian mở): overlay đáy vùng cuộn full-height;
            gradient cho tin nhắn tan dần vào composer; KHÔNG viền cứng — card có shadow. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
          <div className="h-16 bg-gradient-to-t from-white to-transparent dark:from-neutral-900" />
          <div className="bg-white px-3 pb-[calc(0.75rem+4.75rem+env(safe-area-inset-bottom))] sm:px-4 md:pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:bg-neutral-900">
            <div className="pointer-events-auto relative mx-auto max-w-3xl">
              {showScrollBtn && messages.length > 0 && (
                <button
                  type="button"
                  aria-label={t("chat.scrollBottomAria")}
                  title={t("chat.scrollBottomAria")}
                  onClick={() => scrollToBottom("smooth")}
                  className="absolute -top-12 left-1/2 z-10 grid h-9 w-9 -translate-x-1/2 place-items-center rounded-full bg-white text-neutral-500 shadow-md ring-1 ring-neutral-200 hover:text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300 dark:ring-neutral-700 dark:hover:text-neutral-100"
                >
                  <ArrowDown size={16} aria-hidden />
                </button>
              )}
              {/* C2: Claude API cost/scope notice — shown only when a Claude model is active.
                  Positioned directly above the Composer, same visual zone as image cap notices. */}
              {isCurrentClaude && (
                <p
                  role="note"
                  className="mb-1.5 text-[11px] leading-snug text-amber-600 dark:text-amber-500"
                >
                  {t("chat.claudeNote")}
                </p>
              )}
              <Composer
                value={input}
                onChange={setInput}
                onSend={send}
                onStop={stop}
                streaming={streaming}
                attachments={attachments}
                notice={imgNotice}
                onAddFiles={onAddFiles}
                onAddUrl={onAddUrl}
                onRemoveAttachment={onRemoveAttachment}
                onNew={newConv}
                onClear={clearConv}
                onExport={() => setExportOpen(true)}
                onToggleSettings={() => setSettingsOpen((v) => !v)}
                ocrAvailable={ocrAvailable}
                modelName={modelName}
                toolGroups={claudeSelected ? [] : toolGroups}
                toolPick={toolPick}
                onToolPick={onToolPick}
                onToolArg={onToolArg}
              />
            </div>
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

// Downscale an image data URL to a small JPEG thumbnail (attachment preview).
// Basic <canvas> — supported on every browser incl. iOS Safari (NOT pdfjs).
// Returns undefined on failure → attachment just shows a file card, no crash.
async function makeThumb(dataUrl: string, maxPx = 256): Promise<string | undefined> {
  try {
    // No canvas (jsdom / unsupported env) → skip preview, never block the flow.
    if (!document.createElement("canvas").getContext("2d")) return undefined;
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => resolve(null);
      im.src = dataUrl;
      setTimeout(() => resolve(null), 4000); // safety net: never hang on a stuck decode
    });
    if (!img) return undefined;
    const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    return undefined;
  }
}
