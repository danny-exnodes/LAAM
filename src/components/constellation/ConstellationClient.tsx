"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useT } from "@/i18n/provider";
import { constellation } from "@/i18n/dictionaries/constellation";
import type { Lang } from "@/i18n/types";
import Link from "next/link";
import { buildNodes, type ConstNode } from "@/lib/constellation/nodeModel";
import { placeNodes } from "@/lib/constellation/field";
import { ConstellationCanvas } from "./ConstellationCanvas";
import { ConstellationNodes } from "./ConstellationNodes";
import type { CatalogGroup } from "@/lib/chat/toolCatalog";
import type { ConnectorStatus } from "@/lib/connectors/types";
import { useVoice } from "@/components/chat/useVoice";
import { useAudioAnalyser } from "./useAudioAnalyser";
import { AudioWave } from "./AudioWave";

type State = "idle" | "listening" | "thinking" | "speaking";

export function ConstellationClient({ greetingName, lang }: { greetingName: string; lang: Lang }) {
  const t = useT(constellation);

  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [groups, setGroups] = useState<CatalogGroup[]>([]);
  const [connectors, setConnectors] = useState<{ id: string; name: string; status: ConnectorStatus }[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(() =>
    typeof window !== "undefined" ? (localStorage.getItem("laam:chat:agent") ?? undefined) : undefined);

  // command accumulator — will be consumed by CommandDock in Task 6
  const [command, setCommand] = useState("");

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
    }
    // tool pick + idle-connector handling wired in Task 6 (requestedTool) / toast
  }, []);

  // Voice + audio
  const audio = useAudioAnalyser();
  const voice = useVoice({
    lang,
    onTranscript: (txt) => setCommand((p) => (p ? `${p} ${txt}` : txt)),
  });

  // Derive state — "thinking" arrives in Task 6 (streaming flag)
  const state: State = voice.listening ? "listening" : voice.speaking ? "speaking" : "idle";

  // Real audio-reactive level for the canvas
  const getLevel = useCallback(() => {
    const { mic, tts } = audio.sample();
    return voice.listening
      ? Math.max(0.06, mic)
      : voice.speaking
        ? Math.max(0.06, tts * 0.95)
        : 0.15;
  }, [audio, voice.listening, voice.speaking]);

  // Voice toggle: enable starts mic + listening; disable stops both
  const [voiceEnabled, setVoiceEnabled] = useState(false);
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

  // suppress unused-var warnings for props used by later tasks
  void greetingName;
  void command;

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
      <ConstellationNodes placed={placed} onPick={onPick} t={t} />
      {/* Voice controls — only shown when Web Speech is available */}
      {(voice.support.recognition || voice.support.synthesis) && (
        <div className="absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2">
          <AudioWave state={state} sample={audio.sample} />
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
