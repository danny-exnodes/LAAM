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

export function ConstellationClient({ greetingName, lang }: { greetingName: string; lang: Lang }) {
  const t = useT(constellation);

  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [groups, setGroups] = useState<CatalogGroup[]>([]);
  const [connectors, setConnectors] = useState<{ id: string; name: string; status: ConnectorStatus }[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(() =>
    typeof window !== "undefined" ? (localStorage.getItem("laam:chat:agent") ?? undefined) : undefined);

  // command input — controlled by both voice transcript and manual typing
  const [command, setCommand] = useState("");

  // caption shows the streaming assistant reply
  const [caption, setCaption] = useState("");

  // write-gate chip state
  const [pendingWrite, setPendingWrite] = useState<PendingWrite | null>(null);

  // tool requested by node-pick
  const [requestedTool, setRequestedTool] = useState<{ name: string; args: unknown } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const safe = async (u: string) => { try { const r = await fetch(u); return r.ok ? await r.json() : null; } catch { return null; } };
      const [a, g, c] = await Promise.all([safe("/api/custom-agents"), safe("/api/chat/tools"), safe("/api/connectors")]);
      if (!alive) return;
      setAgents(a?.agents ?? []);
      setGroups(g?.groups ?? []);
      setConnectors((c?.connectors ?? []).map((x: { id: string; name: string; status: ConnectorStatus }) => ({ id: x.id, name: x.name, status: x.status })));
    })();
    return () => { alive = false; };
  }, []);

  const placed = useMemo(
    () => placeNodes(buildNodes({ agents, groups, connectors, selectedAgentId })),
    [agents, groups, connectors, selectedAgentId]);

  const onPick = useCallback((n: ConstNode) => {
    if (n.ref.kind === "agent") {
      setSelectedAgentId(n.ref.agentId);
      localStorage.setItem("laam:chat:agent", n.ref.agentId);
    } else if (n.ref.kind === "tool") {
      // Task 6: tool node pick → set requestedTool
      const tool = n.ref.tool ?? n.ref.group.tools[0];
      if (tool) {
        setRequestedTool({ name: tool.name, args: {} });
      }
    }
    // connectorIdle: no dispatch this task (toast is optional per spec)
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

  // State includes "thinking" when streaming
  const state: State = chat.streaming
    ? "thinking"
    : voice.listening
      ? "listening"
      : voice.speaking
        ? "speaking"
        : "idle";

  // speakReply: prefer neural TTS via /api/tts → meter audio for ripples; fallback to browser TTS
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
        url = null; // ownership handed to el handlers
      }
    } catch {
      if (url) URL.revokeObjectURL(url);
    }
    if (!usedNeural) {
      voice.speak(text);
    }
  }, [lang, audio, voice]);

  // Keep speakReply in a ref so the stream-end effect stays dep-stable
  const speakRef = useRef(speakReply);
  speakRef.current = speakReply;

  // Speak the caption when streaming transitions true → false
  const prevStreamingRef = useRef(false);
  const captionRef = useRef(caption); captionRef.current = caption;

  // Real audio-reactive level for the canvas
  const getLevel = useCallback(() => {
    const { mic, tts } = sample();
    return voice.listening
      ? Math.max(0.06, mic)
      : voice.speaking
        ? Math.max(0.06, tts * 0.95)
        : 0.15;
  }, [sample, voice.listening, voice.speaking]);

  // Voice toggle: enable starts mic + listening; disable stops both
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  // Ref mirror for voiceEnabled so the stream-end effect can read it without re-subscribing
  const voiceEnabledRef = useRef(voiceEnabled); voiceEnabledRef.current = voiceEnabled;

  // Stream-end effect: speak caption only when voice is enabled
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    prevStreamingRef.current = chat.streaming;
    if (wasStreaming && !chat.streaming && voiceEnabledRef.current && captionRef.current) {
      void speakRef.current(captionRef.current);
    }
  }, [chat.streaming]);

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

  // Send handler — clears command, fires chat.send with all current context
  const handleSend = useCallback(() => {
    const msg = command.trim();
    if (!msg) return;
    setCaption("");
    setCommand("");
    const model = typeof window !== "undefined" ? (localStorage.getItem("laam:chat:model") ?? undefined) : undefined;
    void chat.send({
      message: msg,
      ...(model ? { model } : {}),
      customAgentId: selectedAgentId,
      ...(requestedTool ? { requestedTool } : {}),
    });
  }, [command, selectedAgentId, requestedTool, chat]);

  // greetingName and lang are passed to SysInfoPanel below

  const stateLabelKey: Record<State, string> = {
    idle: "constellation.stateIdle",
    listening: "constellation.stateListening",
    thinking: "constellation.stateThinking",
    speaking: "constellation.stateSpeaking",
  };

  return (
    <div
      className="relative h-dvh w-screen overflow-hidden bg-[radial-gradient(135%_115%_at_50%_52%,#1d527e_0%,#0e3559_36%,#08233f_64%,#041426_100%)] text-[#eaf6ff]"
      style={{ fontFamily: "var(--font-chakra), sans-serif" }}
      role="application"
      aria-label={t("constellation.regionAria")}
    >
      {/* Canvas FX layer: z-0, behind all HTML overlays */}
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
            <button
              type="button"
              onClick={() => { void chat.confirm(pendingWrite.token, true); setPendingWrite(null); }}
              className="rounded-xl bg-[#5bd6ff]/20 px-4 py-2 text-xs text-[#a9e9ff]"
            >
              {t("constellation.approve")}
            </button>
            <button
              type="button"
              onClick={() => { void chat.confirm(pendingWrite.token, false); setPendingWrite(null); }}
              className="rounded-xl bg-[#ff5b6c]/20 px-4 py-2 text-xs text-[#ff9eb5]"
            >
              {t("constellation.deny")}
            </button>
          </div>
        </div>
      )}

      {/* CommandDock: controlled input wired to voice transcript + chat.send */}
      <CommandDock
        t={t}
        caption={caption}
        value={command}
        onChange={setCommand}
        onSend={handleSend}
      />

      {/* Voice controls — only shown when Web Speech is available */}
      {(voice.support.recognition || voice.support.synthesis) && (
        <div className="absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2">
          <AudioWave state={state} sample={sample} />
          <p className="text-xs tracking-[0.25em] text-[#a9e9ff]">
            {t(stateLabelKey[state])}
          </p>
          <button
            type="button"
            onClick={toggleVoice}
            className="rounded-full border border-[#5bd6ff]/40 bg-[#0a1e34]/70 px-5 py-2 text-sm text-[#a9e9ff]"
          >
            {t("constellation.voice")}
          </button>
        </div>
      )}
    </div>
  );
}
