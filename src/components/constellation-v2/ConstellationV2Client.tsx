"use client";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useT } from "@/i18n/provider";
import { constellation } from "@/i18n/dictionaries/constellation";
import type { Lang } from "@/i18n/types";
import Link from "next/link";
import { MessageSquare, Mic, MicOff } from "lucide-react";
import { GeodesicSun } from "./GeodesicSun";
import { CosmicBackground } from "./CosmicBackground";
import { OrbitingSatellites } from "./OrbitingSatellites";
import { SoftAurora } from "@/components/constellation/SoftAurora";
import { CommandDock } from "@/components/constellation/CommandDock";
import { useConstellationChat, type PendingWrite } from "@/components/constellation/useConstellationChat";
import { buildNodes, type ConstNode } from "@/lib/constellation/nodeModel";
import type { CatalogGroup } from "@/lib/chat/toolCatalog";
import type { ConnectorStatus } from "@/lib/connectors/types";
import { useVoice } from "@/components/chat/useVoice";
import { stripForSpeech, splitForSpeech } from "@/lib/chat/voice";
import { playPcmStream } from "@/lib/chat/streamingAudio";
import { useAudioAnalyser } from "@/components/constellation/useAudioAnalyser";
import { SysInfoPanel } from "@/components/constellation/SysInfoPanel";
import { createWebSpeechStt } from "@/lib/chat/stt";
import { useVoiceConversation } from "@/components/constellation/useVoiceConversation";

type State = "idle" | "listening" | "thinking" | "speaking";

const BOOT_KEYS = [
  "constellation.boot1",
  "constellation.boot2",
  "constellation.boot3",
  "constellation.boot4",
  "constellation.boot5",
  "constellation.boot6",
];

/**
 * v2 demo — same voice/chat orchestration as ConstellationClient, but the
 * node-graph is dropped and the visual anchor is a React Bits <Orb/> (ogl
 * shader) over a plain black background + the v1 drifting particle field.
 * The orb's distortion/rotation effect is driven by conversation state
 * (listening/thinking/speaking), NOT real mouse hover — see OrbCanvas.
 */
export function ConstellationV2Client({ greetingName, lang }: { greetingName: string; lang: Lang }) {
  const t = useT(constellation);

  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [groups, setGroups] = useState<CatalogGroup[]>([]);
  const [connectors, setConnectors] = useState<{ id: string; name: string; status: ConnectorStatus }[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(undefined);
  const [requestedTool, setRequestedTool] = useState<{ name: string; args: unknown } | null>(null);

  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState<string>("");

  const [booting, setBooting] = useState(true);
  const [bootFading, setBootFading] = useState(false);
  const [bootStep, setBootStep] = useState(0);
  const [dataLoaded, setDataLoaded] = useState(false);

  const [command, setCommand] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [caption, setCaption] = useState("");
  const [pendingWrite, setPendingWrite] = useState<PendingWrite | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const s = localStorage.getItem("laam:chat:agent");
    if (s) setSelectedAgentId(s);
  }, []);

  // ---- core data load (agents / tools / connectors) — GATES the boot overlay,
  // same as v1, since the orbiting satellites need this to render anything. ----
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

  // ---- model list — independent, never blocks boot (see v1 for rationale) ----
  useEffect(() => {
    let alive = true;
    (async () => {
      let info: { model?: unknown; claudeModels?: unknown; byteplusModels?: unknown; cerebrasModels?: unknown } | null = null;
      try {
        const r = await fetch("/api/chat/info", { signal: AbortSignal.timeout(6000) });
        info = r.ok ? await r.json() : null;
      } catch { info = null; }
      if (!alive) return;
      const str = (m: unknown): m is string => typeof m === "string" && m.length > 0;
      const bp = (Array.isArray(info?.byteplusModels) ? info.byteplusModels : []).filter(str);
      const cb = (Array.isArray(info?.cerebrasModels) ? info.cerebrasModels : []).filter(str);
      const cl = (Array.isArray(info?.claudeModels) ? info.claudeModels : []).filter(str);
      const rawModel = info?.model;
      const defaultModel = str(rawModel) ? rawModel : "";
      const cloud = Array.from(new Set([...bp, ...cb, ...cl]));
      const list = cloud.length ? cloud : defaultModel ? [defaultModel] : [];
      setModels(list);
      const stored = typeof window !== "undefined" ? localStorage.getItem("laam:chat:model") : null;
      const def = stored && list.includes(stored) ? stored : (bp[0] ?? cb[0] ?? cl[0] ?? defaultModel ?? "");
      if (def) {
        setModel(def);
        if (typeof window !== "undefined") localStorage.setItem("laam:chat:model", def);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!booting) return;
    const id = setInterval(() => setBootStep((s) => Math.min(s + 1, BOOT_KEYS.length - 1)), 450);
    return () => clearInterval(id);
  }, [booting]);

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

  useEffect(() => {
    const id = setTimeout(() => setBooting(false), 9000);
    return () => clearTimeout(id);
  }, []);

  const nodes = useMemo(
    () => buildNodes({ agents, groups, connectors, selectedAgentId }),
    [agents, groups, connectors, selectedAgentId],
  );

  const onPick = useCallback((n: ConstNode) => {
    if (n.ref.kind === "agent") {
      setSelectedAgentId(n.ref.agentId);
      localStorage.setItem("laam:chat:agent", n.ref.agentId);
    } else if (n.ref.kind === "tool") {
      const tool = n.ref.tool ?? n.ref.group.tools[0];
      if (tool) setRequestedTool({ name: tool.name, args: {} });
    }
  }, []);

  const fullReplyRef = useRef("");
  const convStateRef = useRef<"idle" | "listening" | "thinking" | "speaking" | "off">("off");
  const chat = useConstellationChat({
    onText: (text) => { fullReplyRef.current = text; },
    onPendingWrite: setPendingWrite,
  });

  const audio = useAudioAnalyser();
  const { sample } = audio;
  const voice = useVoice({
    lang,
    onTranscript: (txt) => {
      if (voiceEnabledRef.current) return;
      setCommand((p) => (p ? `${p} ${txt}` : txt));
    },
  });

  const sttRef = useRef(createWebSpeechStt());

  const [neuralSpeaking, setNeuralSpeaking] = useState(false);
  const [preparingSpeech, setPreparingSpeech] = useState(false);
  const speaking = voice.speaking || neuralSpeaking;

  useEffect(() => {
    if (voice.speaking) setNeuralSpeaking(false);
  }, [voice.speaking]);

  const state: State = chat.streaming
    ? "thinking"
    : voice.listening
      ? "listening"
      : speaking || preparingSpeech
        ? "speaking"
        : "idle";

  const fellBackRef = useRef(false);
  const speakAbortRef = useRef<AbortController | null>(null);
  const speakReply = useCallback(async (text: string) => {
    if (!text) return;
    const spoken = stripForSpeech(text);
    if (!spoken) return;
    const segments = splitForSpeech(spoken);
    if (!segments.length) return;

    fellBackRef.current = false;
    speakAbortRef.current?.abort();
    const controller = new AbortController();
    speakAbortRef.current = controller;
    const isCurrent = () => speakAbortRef.current === controller;
    setPreparingSpeech(true);
    setCaption("");

    const sink = audio.getTtsSink();
    if (!sink) {
      if (isCurrent()) setPreparingSpeech(false);
      voice.speak(spoken);
      return;
    }

    const fetchSegment = (segText: string) =>
      fetch("/api/tts/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: segText, lang }),
        signal: controller.signal,
      });

    const cursor = { value: 0 };
    let spokenSegments = 0;
    let nextFetch: Promise<Response> | null = fetchSegment(segments[0]);
    try {
      for (let i = 0; i < segments.length; i++) {
        if (controller.signal.aborted) return;
        const res = await nextFetch!;
        nextFetch = i + 1 < segments.length ? fetchSegment(segments[i + 1]) : null;
        if (!res.ok || !res.body) throw new Error("tts stream failed");
        await playPcmStream(res.body, {
          context: sink.context,
          analyser: sink.analyser,
          cursor,
          onFirstAudio: () => {
            if (i === 0) { setNeuralSpeaking(true); if (isCurrent()) setPreparingSpeech(false); }
            if (isCurrent()) setCaption(segments[i]);
          },
          signal: controller.signal,
        });
        spokenSegments = i + 1;
      }
    } catch {
      if (!controller.signal.aborted) {
        fellBackRef.current = true;
        voice.speak(segments.slice(spokenSegments).join(" ") || spoken);
      }
    } finally {
      if (isCurrent()) {
        setPreparingSpeech(false);
        if (!fellBackRef.current) setCaption("");
        if (fellBackRef.current) setTimeout(() => { if (isCurrent()) setNeuralSpeaking(false); }, 4000);
        else setNeuralSpeaking(false);
      }
    }
  }, [audio, lang, voice]);

  const speakRef = useRef(speakReply);
  speakRef.current = speakReply;

  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const voiceEnabledRef = useRef(voiceEnabled); voiceEnabledRef.current = voiceEnabled;

  const prevStreamingRef = useRef(false);
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    prevStreamingRef.current = chat.streaming;
    if (wasStreaming && !chat.streaming && fullReplyRef.current) {
      void speakRef.current(fullReplyRef.current);
    }
  }, [chat.streaming]);

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
      setVoiceEnabled(true);
    } else {
      audio.stopMic();
      speakAbortRef.current?.abort();
      voice.cancelSpeak();
      setVoiceEnabled(false);
    }
  }, [voiceEnabled, audio, voice]);

  const handleSend = useCallback(() => {
    const msg = command.trim();
    if (!msg) return;
    speakAbortRef.current?.abort();
    voice.cancelSpeak();
    setCaption("");
    fullReplyRef.current = "";
    setCommand("");
    void chat.send({
      message: msg,
      ...(model ? { model } : {}),
      customAgentId: selectedAgentId,
      ...(requestedTool ? { requestedTool } : {}),
    });
  }, [command, model, selectedAgentId, requestedTool, chat, voice]);

  const submitText = useCallback(
    (msg: string) => {
      const text = msg.trim();
      if (!text) return;
      speakAbortRef.current?.abort();
      voice.cancelSpeak();
      setCaption("");
      fullReplyRef.current = "";
      void chat.send({
        message: text,
        ...(model ? { model } : {}),
        customAgentId: selectedAgentId,
        ...(requestedTool ? { requestedTool } : {}),
      });
    },
    [chat, model, selectedAgentId, requestedTool, voice],
  );

  const { convState } = useVoiceConversation({
    enabled: voiceEnabled,
    lang,
    stt: sttRef.current,
    sample,
    isReplying: chat.streaming,
    isPreparingSpeech: preparingSpeech,
    isSpeaking: speaking,
    onSubmit: submitText,
    onBargeIn: () => {
      speakAbortRef.current?.abort();
      voice.cancelSpeak();
    },
  });
  convStateRef.current = convState;

  const onModelChange = useCallback((m: string) => {
    setModel(m);
    if (typeof window !== "undefined") localStorage.setItem("laam:chat:model", m);
  }, []);

  const voiceSupported = voice.support.recognition || voice.support.synthesis;

  const canvasMode: State =
    convState !== "off"
      ? convState
      : chat.streaming
        ? "thinking"
        : state === "speaking"
          ? "speaking"
          : "idle";

  // While speaking, the particle-pull/brightness strength tracks real TTS
  // amplitude (ranged 0..0.5); 0 otherwise. A flat non-zero fallback here
  // (an earlier version returned 0.5 for listening/thinking) caused a visible
  // flicker: SoftAurora's getIntensity isn't gated by speakFactor, so it would
  // snap straight to that ceiling the instant canvasMode left "speaking" —
  // and even in GeodesicSun (gated by speakFactor > 0.05) it produced a hard
  // jump from the real tapering tts amplitude to 0.5 for the few frames
  // speakFactor took to decay below the gate.
  const getOrbIntensity = useCallback(() => {
    if (canvasMode !== "speaking") return 0;
    const { tts } = sample();
    return Math.min(0.5, Math.max(0, tts));
  }, [canvasMode, sample]);

  const btnBase =
    "flex h-10 w-10 items-center justify-center rounded-full border transition-all duration-200 " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5bd6ff]/50";
  const btnOff =
    "border-white/10 bg-white/[0.03] text-[#a9e9ff]/90 hover:border-[#5bd6ff]/40 hover:bg-white/[0.06] hover:text-[#eaf9ff]";
  const btnOn = "border-[#5bd6ff]/60 bg-[#5bd6ff]/15 text-[#eaf9ff] shadow-[0_0_18px_rgba(91,214,255,.25)]";

  const stateLabelKey: Record<State, string> = {
    idle: "constellation.stateIdle",
    listening: "constellation.stateListening",
    thinking: "constellation.stateThinking",
    speaking: "constellation.stateSpeaking",
  };
  const stateDotColor: Record<State, string> = {
    idle: "#5bd6ff",
    // Was coral/red — read as an error state rather than "listening". Green.
    listening: "#6effa0",
    thinking: "#9beeff",
    speaking: "#5bd6ff",
  };


  return (
    <div
      className="relative h-dvh w-screen overflow-hidden bg-black text-[#eaf6ff] antialiased"
      style={{ fontFamily: "var(--font-chakra), sans-serif" }}
      role="application"
      aria-label={t("constellation.regionAria")}
    >
      <CosmicBackground showLinks={false} />
      <SoftAurora
        className="absolute inset-0 z-0"
        color1="#9c43fe"
        color2="#4cc2e9"
        brightness={0.5}
        bandHeight={0.5}
        bandSpread={0.4}
        enableMouseInteraction={false}
        getIntensity={getOrbIntensity}
      />
      <GeodesicSun mode={canvasMode} getIntensity={getOrbIntensity} />
      <OrbitingSatellites nodes={nodes} onPick={onPick} t={t} />

      {/* Top bar — SysInfoPanel owns the left corner; center status pill + right back link */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-center px-6 py-5">
        <div className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.03] py-1.5 pl-1.5 pr-3 backdrop-blur-md">
          <span className="rounded-full border border-[#5bd6ff]/30 px-2 py-0.5 text-[9.5px] font-medium tracking-[0.2em] text-[#5bd6ff]">
            V2
          </span>
          <span
            className="h-1.5 w-1.5 rounded-full transition-colors duration-300"
            style={{ backgroundColor: stateDotColor[canvasMode], boxShadow: `0 0 8px ${stateDotColor[canvasMode]}` }}
          />
          <span className="text-[10.5px] font-medium tracking-[0.2em] text-[#bcd9ec]">{t(stateLabelKey[state])}</span>
        </div>
      </div>
      <Link
        href="/chat"
        className="absolute right-6 top-5 z-10 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-[12.5px] font-medium text-[#a9e9ff]/90 backdrop-blur-md transition-colors hover:border-[#5bd6ff]/40 hover:bg-white/[0.06] hover:text-[#eaf9ff]"
      >
        {t("constellation.back")}
      </Link>

      <SysInfoPanel greetingName={greetingName} t={t} lang={lang} />

      {pendingWrite && (
        <div className="absolute left-1/2 top-1/2 z-30 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 rounded-2xl border border-[#ffce7a]/30 bg-[#08182a]/95 px-6 py-4 text-center shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)] backdrop-blur-xl">
          <p className="text-sm font-semibold text-[#ffce7a]">{pendingWrite.title}</p>
          <p className="max-w-[320px] text-xs text-[#bcd9ec]">{pendingWrite.summary}</p>
          <div className="flex gap-3">
            <button type="button" onClick={() => { void chat.confirm(pendingWrite.token, true); setPendingWrite(null); }} className="rounded-xl bg-[#5bd6ff]/20 px-4 py-2 text-xs text-[#a9e9ff] transition-colors hover:bg-[#5bd6ff]/30">
              {t("constellation.approve")}
            </button>
            <button type="button" onClick={() => { void chat.confirm(pendingWrite.token, false); setPendingWrite(null); }} className="rounded-xl bg-[#ff5b6c]/20 px-4 py-2 text-xs text-[#ff9eb5] transition-colors hover:bg-[#ff5b6c]/30">
              {t("constellation.deny")}
            </button>
          </div>
        </div>
      )}

      {!booting && (
        <>
          <CommandDock t={t} caption={caption} open={chatOpen} value={command} onChange={setCommand} onSend={handleSend} />

          <div className="absolute bottom-6 right-4 z-20 flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] p-1.5 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.55)] backdrop-blur-xl">
            {models.length > 0 && (
              <select
                aria-label={t("constellation.modelAria")}
                value={model}
                onChange={(e) => onModelChange(e.target.value)}
                className="w-[120px] truncate rounded-full border border-transparent bg-transparent px-3 py-2 text-[12px] text-[#a9e9ff]/90 outline-none transition-colors hover:border-white/10"
              >
                {models.map((m) => (
                  <option key={m} value={m} className="bg-[#0a1e34] text-[#eaf6ff]">{m}</option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => setChatOpen((o) => !o)}
              aria-pressed={chatOpen}
              title={t("constellation.chat")}
              aria-label={t("constellation.chat")}
              className={`${btnBase} ${chatOpen ? btnOn : btnOff}`}
            >
              <MessageSquare size={17} strokeWidth={2} />
            </button>
            {voiceSupported && (
              <button
                type="button"
                onClick={toggleVoice}
                aria-pressed={voiceEnabled}
                title={t("constellation.voice")}
                aria-label={t("constellation.voice")}
                className={`${btnBase} ${voiceEnabled ? btnOn : btnOff}`}
              >
                {voiceEnabled ? <Mic size={17} strokeWidth={2} /> : <MicOff size={17} strokeWidth={2} />}
              </button>
            )}
          </div>
        </>
      )}

      {booting && (
        <div
          className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black transition-opacity duration-700"
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
