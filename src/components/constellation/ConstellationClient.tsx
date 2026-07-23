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
import { stripForSpeech, splitForSpeech } from "@/lib/chat/voice";
import { playPcmStream } from "@/lib/chat/streamingAudio";
import { useAudioAnalyser } from "./useAudioAnalyser";
import { AudioWave } from "./AudioWave";
import { SysInfoPanel } from "./SysInfoPanel";
import { createWebSpeechStt } from "@/lib/chat/stt";
import { useVoiceConversation } from "./useVoiceConversation";

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
  // caption shows ONLY the segment currently being spoken (set inside speakReply) — the
  // full growing reply text is intentionally never rendered here; it overflowed the screen
  // while streaming, before speech even started. The full text is still captured (below,
  // via fullReplyRef) so speakReply has something to read once streaming ends.
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

  // Chat hook — onText streams the growing full reply into fullReplyRef (not shown on
  // screen); only speakReply's per-segment setCaption calls ever reach the UI.
  const fullReplyRef = useRef("");
  // Mirrors convState for getLevel (declared before it's read; see Step 7 in the plan) —
  // getLevel needs the current hands-free listening state without depending on convState.
  const convStateRef = useRef<"idle" | "listening" | "thinking" | "speaking" | "off">("off");
  const chat = useConstellationChat({
    onText: (text) => { fullReplyRef.current = text; },
    onPendingWrite: setPendingWrite,
  });

  // Voice + audio
  const audio = useAudioAnalyser();
  const { sample } = audio;
  const voice = useVoice({
    lang,
    onTranscript: (txt) => {
      // In hands-free mode the conversation hook drives STT; don't also fill the box.
      if (voiceEnabledRef.current) return;
      setCommand((p) => (p ? `${p} ${txt}` : txt));
    },
  });

  // STT provider for hands-free conversation. Created once; swap createWebSpeechStt for a
  // future createWhisperStt without touching the conversation hook.
  const sttRef = useRef(createWebSpeechStt());

  // Neural TTS (speakReply → /api/tts/stream → playPcmStream) is the PRIMARY speaking
  // path — it never touches `voice.speaking`, which useVoice only sets for the browser-
  // FALLBACK. Without this, `state`/`getLevel` below saw the reply play out with no "speaking"
  // signal at all: the state label never changed and the canvas fell back to a flat level
  // (no pulse) for the whole neural-TTS duration — reported as the wave "biến mất" and the
  // background looking frozen ("khựng") while Jarvis talks.
  const [neuralSpeaking, setNeuralSpeaking] = useState(false);
  // Set the instant speakReply starts working a reply (before the first network byte),
  // cleared on the first real audio frame or once speakReply exits either way. Closes the
  // gap between "reply text finished streaming" and "neural audio actually starts" (network
  // + VieNeu-CPU inference latency, measured ~0.3-1s+), during which the core ring's pulse
  // previously went flat/static — reported as the animation "freezing". Included in the
  // SAME pulse formula as real speaking (getLevel below), not a separate visual, so there is
  // no mode-switch jerk when real audio takes over (Max-blends with 0 real amplitude until
  // then) — unlike the earlier neuralSpeaking-at-synthesis-start attempt (see CHANGELOG),
  // which fired before ANY request existed and used a different codepath.
  const [preparingSpeech, setPreparingSpeech] = useState(false);
  const speaking = voice.speaking || neuralSpeaking;

  // Bridges the fallback handoff (see speakReply below): once voice.speaking itself goes
  // true, `speaking` is already correctly driven by it, so this clear is redundant-but-safe.
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

  // speakReply: stream the reply through VieNeu (/api/tts/stream), split into short
  // segments (splitForSpeech) and played back-to-back on a shared scheduling cursor so
  // they join gaplessly. Segmenting keeps every /tts/stream request comfortably inside
  // the route's timeout regardless of reply length (a single-request stream for a long
  // reply can need minutes to finish generating and gets killed mid-speech — see
  // CHANGELOG). The next segment's fetch is kicked off as soon as the current segment's
  // response headers arrive (not after it finishes playing), so VieNeu — faster than
  // real-time — usually has the next segment ready before the current one ends.
  // stripForSpeech FIRST (VieNeu has no markdown awareness). neuralSpeaking flips on the
  // first real audio frame. On a genuine failure (not superseded by a newer reply), fall
  // back to the browser voice for whatever hasn't already been spoken by neural TTS —
  // not the whole reply again.
  //
  // Subtitle display: `caption` shows ONLY the segment currently being read — cleared
  // while waiting for the first segment, then swapped to each segment's own text the
  // instant its audio actually starts (the same onFirstAudio signal, fired per segment
  // via playPcmStream's prebuffer). The full reply text is never rendered anywhere on
  // this page (see fullReplyRef above) — it used to sit on screen as `caption` for the
  // whole streaming phase, overflowing well past a couple of sentences before speech even
  // started. Fallback-to-browser-voice keeps whatever was last shown — SpeechSynthesis has
  // no per-segment start signal to sync against.
  const fellBackRef = useRef(false);
  const speakAbortRef = useRef<AbortController | null>(null);
  const speakReply = useCallback(async (text: string) => {
    if (!text) return;
    const spoken = stripForSpeech(text);
    if (!spoken) return;
    const segments = splitForSpeech(spoken);
    if (!segments.length) return;

    fellBackRef.current = false;
    speakAbortRef.current?.abort(); // cancel any in-flight playback before starting new
    const controller = new AbortController();
    speakAbortRef.current = controller;
    // Only the still-current call (not superseded by a newer speakReply) may touch
    // shared UI state in its cleanup paths — guards against a race where an aborted
    // call's cleanup runs after a newer call already started (see Task 6 review notes;
    // preparingSpeech sets synchronously at call-start, unlike neuralSpeaking, so it
    // needs this guard even though neuralSpeaking's network-bound sets never needed it).
    const isCurrent = () => speakAbortRef.current === controller;
    setPreparingSpeech(true);
    setCaption("");

    const sink = audio.getTtsSink();
    if (!sink) {
      // No Web Audio available at all — go straight to the browser fallback instead of
      // silently speaking nothing.
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
        // Kick off the NEXT segment's request now, while THIS one is about to play —
        // not after it finishes — so it has the whole playback duration to be ready.
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
      // Aborted (superseded by a newer reply) is not a failure — don't fall back.
      if (!controller.signal.aborted) {
        fellBackRef.current = true;
        // Only re-speak what neural TTS hasn't already said, not the whole reply.
        voice.speak(segments.slice(spokenSegments).join(" ") || spoken);
      }
    } finally {
      if (isCurrent()) {
        setPreparingSpeech(false);
        // Done reading via neural TTS — the subtitle disappears, like a movie's does when
        // nobody's talking. Leave it showing the last segment during a fallback instead;
        // there's no per-segment signal for the browser voice to know when it's done.
        if (!fellBackRef.current) setCaption("");
        // Same handoff rule as before: on the browser-TTS fallback, keep neuralSpeaking
        // true until voice.speaking takes over (the effect above clears it), with a 4s
        // safety net; otherwise clear immediately.
        if (fellBackRef.current) setTimeout(() => { if (isCurrent()) setNeuralSpeaking(false); }, 4000);
        else setNeuralSpeaking(false);
      }
    }
  }, [audio, lang, voice]);

  const speakRef = useRef(speakReply);
  speakRef.current = speakReply;

  // ---- Real audio-reactive level for the canvas ----
  // Mic amplitude drives it while listening. While speaking (or preparingSpeech — see
  // above), prefer the real neural-TTS amplitude (`tts`); browser speechSynthesis is NOT
  // metered and there's genuinely no real amplitude yet during preparingSpeech, so fall
  // back to a rhythmic pulse so the core swarm + ring visibly "wave" whenever a reply is
  // being spoken or about to be (mirrors the prototype's voiceEnv pulse). Same formula
  // for both — no visual mode-switch when preparingSpeech hands off to real speaking.
  // NOTE: `level` intentionally does NOT react to chat.streaming ("thinking") — it
  // drives the ring's width/glow/ripples, and pulsing those the same way as speaking
  // made the thinking cue look identical to Javis talking. The thinking indicator
  // (faster swarm + blue-white ring tint) is driven by the separate `mode` prop
  // on ConstellationCanvas instead — see the eased thinkFactor there.
  const getLevel = useCallback(() => {
    const { mic, tts } = sample();
    if (convStateRef.current === "listening") return Math.max(0.06, mic);
    if (voice.listening) return Math.max(0.06, mic);
    if (speaking || preparingSpeech) {
      const pulse = 0.34 + 0.32 * Math.abs(Math.sin(Date.now() / 130));
      return Math.max(0.06, tts * 0.95, pulse);
    }
    return 0.15;
  }, [sample, voice.listening, speaking, preparingSpeech]);

  // Voice toggle: enable starts mic + listening; disable stops both.
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const voiceEnabledRef = useRef(voiceEnabled); voiceEnabledRef.current = voiceEnabled;

  // Speak the full reply when streaming transitions true → false (voice-enabled only).
  const prevStreamingRef = useRef(false);
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    prevStreamingRef.current = chat.streaming;
    if (wasStreaming && !chat.streaming && voiceEnabledRef.current && fullReplyRef.current) {
      void speakRef.current(fullReplyRef.current);
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
      setVoiceEnabled(true);
    } else {
      audio.stopMic();
      // Abort neural TTS (the PRIMARY speaking path) before the browser-fallback
      // cancel — same ordering as handleSend/submitText — so disabling mid-turn
      // actually stops Jarvis instead of leaving his reply playing.
      speakAbortRef.current?.abort();
      voice.cancelSpeak();
      setVoiceEnabled(false);
    }
  }, [voiceEnabled, audio, voice]);

  const handleSend = useCallback(() => {
    const msg = command.trim();
    if (!msg) return;
    // Submitting a new message cuts off whatever Javis is still saying from the
    // previous reply — abort() stops the neural-TTS fetch/playback (speakReply's
    // finally block resets preparingSpeech/neuralSpeaking), cancelSpeak() covers the
    // browser-fallback path abort() alone doesn't reach.
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

  // Submit an arbitrary utterance (voice turn) through the same path as manual send,
  // including the "cut Jarvis off before a new turn" behavior.
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
    isSpeaking: speaking, // voice.speaking || neuralSpeaking (already derived above)
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

  const stateLabelKey: Record<State, string> = {
    idle: "constellation.stateIdle",
    listening: "constellation.stateListening",
    thinking: "constellation.stateThinking",
    speaking: "constellation.stateSpeaking",
  };

  const voiceSupported = voice.support.recognition || voice.support.synthesis;

  // Ring tint source: in hands-free mode the conversation state drives it; otherwise fall
  // back to the manual-typing behavior (thinking while streaming, else idle/speaking gold).
  const canvasMode: "idle" | "listening" | "thinking" | "speaking" =
    convState !== "off"
      ? convState
      : chat.streaming
        ? "thinking"
        : "idle";

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
      <ConstellationCanvas placed={placed} getLevel={getLevel} mode={canvasMode} />
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
          {/* Waveform + state label — hidden per request (keep only the caption sub
              text on screen); left commented instead of removed so it's easy to bring
              back if the state indicator is wanted again later.
          {voiceSupported && (
            <div className="pointer-events-none absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1">
              <AudioWave state={state} sample={sample} />
              <p className="text-xs tracking-[0.25em] text-[#a9e9ff]">{t(stateLabelKey[state])}</p>
            </div>
          )}
          */}

          {/* Caption + command input panel */}
          <CommandDock t={t} caption={caption} open={chatOpen} value={command} onChange={setCommand} onSend={handleSend} />

          {/* Unified control bar: model · chat · voice — single row, no overlap */}
          <div className="absolute bottom-6 right-4 z-20 flex items-center gap-2">
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
