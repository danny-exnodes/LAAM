"use client";
import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import { useT } from "@/i18n/provider";
import { constellation } from "@/i18n/dictionaries/constellation";
import type { Lang } from "@/i18n/types";
import Link from "next/link";
import { buildNodes, type ConstNode } from "@/lib/constellation/nodeModel";
import { placeNodes } from "@/lib/constellation/field";
import { ConstellationCanvas } from "./ConstellationCanvas";
import { ConstellationNodes } from "./ConstellationNodes";
import { CommandDock } from "./CommandDock";
import { useConstellationChat, type PendingWrite } from "./useConstellationChat";
import type { CatalogGroup } from "@/lib/chat/toolCatalog";
import type { ConnectorStatus } from "@/lib/connectors/types";
import { useVoice } from "@/components/chat/useVoice";
import { useAudioAnalyser } from "./useAudioAnalyser";
import { AudioWave } from "./AudioWave";
import { SysInfoPanel } from "./SysInfoPanel";

type State = "idle" | "listening" | "thinking" | "speaking";

// Boot-sequence message keys, stepped through while the page initializes.
const BOOT_KEYS = [
  "constellation.boot1",
  "constellation.boot2",
  "constellation.boot3",
  "constellation.boot4",
  "constellation.boot5",
  "constellation.boot6",
];

export function ConstellationClient({ greetingName, lang }: { greetingName: string; lang: Lang }) {
  const t = useT(constellation);

  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [groups, setGroups] = useState<CatalogGroup[]>([]);
  const [connectors, setConnectors] = useState<{ id: string; name: string; status: ConnectorStatus }[]>([]);
  // localStorage-derived state is read AFTER mount (see effects below) so the
  // SSR HTML and the first client render match — reading it in the initializer
  // would diverge (server has no localStorage) and break hydration.
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(undefined);

  // Available chat models + the selected one (persisted; consumed by chat.send).
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState<string>("");

  // Boot / loading gate — interactive controls stay hidden until data loads.
  const [booting, setBooting] = useState(true);
  const [bootFading, setBootFading] = useState(false);
  const [bootStep, setBootStep] = useState(0);
  const [dataLoaded, setDataLoaded] = useState(false);

  // command input — controlled by both voice transcript and manual typing
  const [command, setCommand] = useState("");
  // chat command panel open/closed (toggle lives in the control bar)
  const [chatOpen, setChatOpen] = useState(false);
  // caption shows the streaming assistant reply
  const [caption, setCaption] = useState("");
  // write-gate chip state
  const [pendingWrite, setPendingWrite] = useState<PendingWrite | null>(null);
  // tool requested by node-pick
  const [requestedTool, setRequestedTool] = useState<{ name: string; args: unknown } | null>(null);

  // Hydrate the selected agent from localStorage after mount (SSR-safe).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const s = localStorage.getItem("laam:chat:agent");
    if (s) setSelectedAgentId(s);
  }, []);

  // ---- core data load (agents / tools / connectors) — GATES the boot overlay ----
  useEffect(() => {
    let alive = true;
    (async () => {
      const safe = async (u: string) => {
        try { const r = await fetch(u, { signal: AbortSignal.timeout(8000) }); return r.ok ? await r.json() : null; } catch { return null; }
      };
      const [a, g, c] = await Promise.all([
        safe("/api/custom-agents"),
        safe("/api/chat/tools"),
        safe("/api/connectors"),
      ]);
      if (!alive) return;
      setAgents(a?.agents ?? []);
      setGroups(g?.groups ?? []);
      setConnectors((c?.connectors ?? []).map((x: { id: string; name: string; status: ConnectorStatus }) => ({ id: x.id, name: x.name, status: x.status })));
      setDataLoaded(true);
    })();
    return () => { alive = false; };
  }, []);

  // ---- model list — INDEPENDENT (never blocks boot); CLOUD ONLY (BytePlus → Claude).
  //      Ollama is intentionally NOT queried: it's unused, and hitting
  //      /api/ollama/models when the local server is down logs an error in the
  //      browser console. Default selection is the first BytePlus model. ----
  useEffect(() => {
    let alive = true;
    (async () => {
      let info: { model?: unknown; claudeModels?: unknown; byteplusModels?: unknown } | null = null;
      try {
        const r = await fetch("/api/chat/info", { signal: AbortSignal.timeout(6000) });
        info = r.ok ? await r.json() : null;
      } catch { info = null; }
      if (!alive) return;
      const str = (m: unknown): m is string => typeof m === "string" && m.length > 0;
      const bp = (Array.isArray(info?.byteplusModels) ? info.byteplusModels : []).filter(str);
      const cl = (Array.isArray(info?.claudeModels) ? info.claudeModels : []).filter(str);
      const rawModel = info?.model;
      const defaultModel = str(rawModel) ? rawModel : "";
      const cloud = Array.from(new Set([...bp, ...cl]));
      // Only fall back to the deployed default (may be an Ollama model) if no cloud model exists.
      const list = cloud.length ? cloud : defaultModel ? [defaultModel] : [];
      setModels(list);
      const stored = typeof window !== "undefined" ? localStorage.getItem("laam:chat:model") : null;
      const def = stored && list.includes(stored) ? stored : (bp[0] ?? cl[0] ?? defaultModel ?? "");
      if (def) {
        setModel(def);
        if (typeof window !== "undefined") localStorage.setItem("laam:chat:model", def);
      }
    })();
    return () => { alive = false; };
  }, []);

  // ---- boot sequence: advance the message, then reveal once data is ready ----
  useEffect(() => {
    if (!booting) return;
    const id = setInterval(() => setBootStep((s) => Math.min(s + 1, BOOT_KEYS.length - 1)), 450);
    return () => clearInterval(id);
  }, [booting]);

  // Finalize boot exactly once. `bootFading` is deliberately NOT a dependency:
  // if it were, `setBootFading(true)` would re-run this effect, whose cleanup
  // would clearTimeout the pending `setBooting(false)` — leaving booting stuck
  // true forever (overlay fades to opacity 0 but the control bar never shows).
  const finalizingRef = useRef(false);
  useEffect(() => {
    if (finalizingRef.current) return;
    if (booting && dataLoaded && bootStep >= BOOT_KEYS.length - 1) {
      finalizingRef.current = true;
      setBootFading(true);
      const id = setTimeout(() => setBooting(false), 650);
      return () => clearTimeout(id);
    }
  }, [booting, dataLoaded, bootStep]);

  // Absolute failsafe: never let the boot overlay trap the UI (e.g. a hung fetch).
  useEffect(() => {
    const id = setTimeout(() => setBooting(false), 9000);
    return () => clearTimeout(id);
  }, []);

  const placed = useMemo(
    () => placeNodes(buildNodes({ agents, groups, connectors, selectedAgentId })),
    [agents, groups, connectors, selectedAgentId]);

  const onPick = useCallback((n: ConstNode) => {
    if (n.ref.kind === "agent") {
      setSelectedAgentId(n.ref.agentId);
      localStorage.setItem("laam:chat:agent", n.ref.agentId);
    } else if (n.ref.kind === "tool") {
      const tool = n.ref.tool ?? n.ref.group.tools[0];
      if (tool) setRequestedTool({ name: tool.name, args: {} });
    }
    // connectorIdle: no dispatch (optional toast per spec)
  }, []);

  // Chat hook
  const chat = useConstellationChat({ onText: setCaption, onPendingWrite: setPendingWrite });

  // Voice + audio
  const audio = useAudioAnalyser();
  const { sample } = audio;
  const voice = useVoice({
    lang,
    onTranscript: (txt) => setCommand((p) => (p ? `${p} ${txt}` : txt)),
  });

  const state: State = chat.streaming
    ? "thinking"
    : voice.listening
      ? "listening"
      : voice.speaking
        ? "speaking"
        : "idle";

  // speakReply: prefer neural TTS via /api/tts → meter audio for ripples; fallback to browser TTS.
  const speakReply = useCallback(async (text: string) => {
    if (!text) return;
    let usedNeural = false;
    let url: string | null = null;
    try {
      const res = await fetch("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, lang }) });
      if (res.ok && typeof window !== "undefined" && typeof Audio !== "undefined") {
        const blob = await res.blob();
        url = URL.createObjectURL(blob);
        const u = url;
        const el = new Audio(u);
        el.onended = () => URL.revokeObjectURL(u);
        el.onerror = () => URL.revokeObjectURL(u);
        audio.attachTts(el);
        await el.play();
        usedNeural = true;
        url = null;
      }
    } catch {
      if (url) URL.revokeObjectURL(url);
    }
    if (!usedNeural) voice.speak(text);
  }, [lang, audio, voice]);

  const speakRef = useRef(speakReply);
  speakRef.current = speakReply;

  // ---- Real audio-reactive level for the canvas ----
  // Mic amplitude drives it while listening. While speaking, prefer the real
  // neural-TTS amplitude (`tts`); browser speechSynthesis is NOT metered, so
  // fall back to a rhythmic pulse so the core swarm + ring visibly "wave"
  // whenever a reply is being spoken (mirrors the prototype's voiceEnv pulse).
  const getLevel = useCallback(() => {
    const { mic, tts } = sample();
    if (voice.listening) return Math.max(0.06, mic);
    if (voice.speaking) {
      const pulse = 0.34 + 0.32 * Math.abs(Math.sin(Date.now() / 130));
      return Math.max(0.06, tts * 0.95, pulse);
    }
    return 0.15;
  }, [sample, voice.listening, voice.speaking]);

  // Voice toggle: enable starts mic + listening; disable stops both.
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const voiceEnabledRef = useRef(voiceEnabled); voiceEnabledRef.current = voiceEnabled;

  // Speak the caption when streaming transitions true → false (voice-enabled only).
  const prevStreamingRef = useRef(false);
  const captionRef = useRef(caption); captionRef.current = caption;
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    prevStreamingRef.current = chat.streaming;
    if (wasStreaming && !chat.streaming && voiceEnabledRef.current && captionRef.current) {
      void speakRef.current(captionRef.current);
    }
  }, [chat.streaming]);

  // ---- On load-complete: speak the greeting once ----
  const greetedRef = useRef(false);
  useEffect(() => {
    if (booting || greetedRef.current) return;
    greetedRef.current = true;
    const name = greetingName || (lang === "vi" ? "bạn" : lang === "zh" ? "朋友" : "there");
    void speakRef.current(t("constellation.greetVoice", { name }));
  }, [booting, greetingName, lang, t]);

  const toggleVoice = useCallback(async () => {
    if (!voiceEnabled) {
      audio.ensure();
      await audio.startMic();
      voice.startListening();
      setVoiceEnabled(true);
    } else {
      voice.stopListening();
      audio.stopMic();
      voice.cancelSpeak();
      setVoiceEnabled(false);
    }
  }, [voiceEnabled, audio, voice]);

  const handleSend = useCallback(() => {
    const msg = command.trim();
    if (!msg) return;
    setCaption("");
    setCommand("");
    void chat.send({
      message: msg,
      ...(model ? { model } : {}),
      customAgentId: selectedAgentId,
      ...(requestedTool ? { requestedTool } : {}),
    });
  }, [command, model, selectedAgentId, requestedTool, chat]);

  const onModelChange = useCallback((m: string) => {
    setModel(m);
    if (typeof window !== "undefined") localStorage.setItem("laam:chat:model", m);
  }, []);

  const stateLabelKey: Record<State, string> = {
    idle: "constellation.stateIdle",
    listening: "constellation.stateListening",
    thinking: "constellation.stateThinking",
    speaking: "constellation.stateSpeaking",
  };

  const voiceSupported = voice.support.recognition || voice.support.synthesis;
  const btnBase = "rounded-full border px-4 py-3 text-[13px] transition";
  const btnOff = "border-[#5bd6ff]/20 bg-[#0a1e34]/60 text-[#a9e9ff] hover:border-[#5bd6ff]/40";
  const btnOn = "border-[#ffce7a]/50 bg-[#ffce7a]/15 text-[#ffd98f]";

  return (
    <div
      className="relative h-dvh w-screen overflow-hidden bg-[radial-gradient(135%_115%_at_50%_52%,#1d527e_0%,#0e3559_36%,#08233f_64%,#041426_100%)] text-[#eaf6ff]"
      style={{ fontFamily: "var(--font-chakra), sans-serif" }}
      role="application"
      aria-label={t("constellation.regionAria")}
    >
      {/* Canvas + nodes render underneath the boot overlay so they're ready on reveal */}
      <ConstellationCanvas placed={placed} getLevel={getLevel} />
      <Link href="/chat" className="absolute right-4 top-4 z-10 rounded-full border border-[#5bd6ff]/30 bg-[#0a1e34]/60 px-4 py-2 text-sm text-[#a9e9ff]">
        {t("constellation.back")}
      </Link>
      <h1 className="absolute left-1/2 top-6 z-10 -translate-x-1/2 text-sm tracking-[0.3em] text-[#a9e9ff]">
        {t("constellation.title")}
      </h1>
      <SysInfoPanel greetingName={greetingName} t={t} lang={lang} />
      <ConstellationNodes placed={placed} onPick={onPick} t={t} />

      {/* Write-gate confirm chip */}
      {pendingWrite && (
        <div className="absolute left-1/2 top-1/2 z-30 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 rounded-2xl border border-[#ffce7a]/40 bg-[#08182a]/95 px-6 py-4 text-center">
          <p className="text-sm font-semibold text-[#ffce7a]">{pendingWrite.title}</p>
          <p className="max-w-[320px] text-xs text-[#bcd9ec]">{pendingWrite.summary}</p>
          <div className="flex gap-3">
            <button type="button" onClick={() => { void chat.confirm(pendingWrite.token, true); setPendingWrite(null); }} className="rounded-xl bg-[#5bd6ff]/20 px-4 py-2 text-xs text-[#a9e9ff]">
              {t("constellation.approve")}
            </button>
            <button type="button" onClick={() => { void chat.confirm(pendingWrite.token, false); setPendingWrite(null); }} className="rounded-xl bg-[#ff5b6c]/20 px-4 py-2 text-xs text-[#ff9eb5]">
              {t("constellation.deny")}
            </button>
          </div>
        </div>
      )}

      {/* Interactive controls — only after boot completes */}
      {!booting && (
        <>
          {/* Waveform + state label, above the control bar */}
          {voiceSupported && (
            <div className="pointer-events-none absolute bottom-28 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1">
              <AudioWave state={state} sample={sample} />
              <p className="text-xs tracking-[0.25em] text-[#a9e9ff]">{t(stateLabelKey[state])}</p>
            </div>
          )}

          {/* Caption + command input panel */}
          <CommandDock t={t} caption={caption} open={chatOpen} value={command} onChange={setCommand} onSend={handleSend} />

          {/* Unified control bar: model · chat · voice — single row, no overlap */}
          <div className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2">
            {models.length > 0 && (
              <select
                aria-label={t("constellation.modelAria")}
                value={model}
                onChange={(e) => onModelChange(e.target.value)}
                className="max-w-[42vw] truncate rounded-full border border-[#5bd6ff]/20 bg-[#0a1e34]/70 px-3 py-2.5 text-[12px] text-[#a9e9ff] outline-none"
              >
                {models.map((m) => (
                  <option key={m} value={m} className="bg-[#0a1e34] text-[#eaf6ff]">{m}</option>
                ))}
              </select>
            )}
            <button type="button" onClick={() => setChatOpen((o) => !o)} className={`${btnBase} ${chatOpen ? btnOn : btnOff}`}>
              {t("constellation.chat")}
            </button>
            {voiceSupported && (
              <button type="button" onClick={toggleVoice} aria-pressed={voiceEnabled} className={`${btnBase} ${voiceEnabled ? btnOn : btnOff}`}>
                {t("constellation.voice")}
              </button>
            )}
          </div>
        </>
      )}

      {/* Boot / loading overlay */}
      {booting && (
        <div
          className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[#041426] transition-opacity duration-700"
          style={{ opacity: bootFading ? 0 : 1 }}
        >
          <div className="text-3xl font-semibold tracking-[0.7em] text-[#a9e9ff]" style={{ textShadow: "0 0 34px rgba(91,214,255,.5)" }}>
            {t("constellation.bootTitle")}
          </div>
          <div className="font-mono text-[11.5px] tracking-[2px] text-[#5bd6ff]">{t(BOOT_KEYS[bootStep])}</div>
        </div>
      )}
    </div>
  );
}
