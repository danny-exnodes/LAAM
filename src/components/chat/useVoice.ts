"use client";

// useVoice — thin client adapter over the browser Web Speech API. SSR-safe
// (all window access inside effects/handlers, guarded by typeof window). The
// deterministic bits (feature detection, BCP-47 mapping, prose stripping) live
// in the pure, unit-tested @/lib/chat/voice module; this hook is the I/O shell,
// so it is exercised via that module's tests rather than jsdom (no Web Speech).
//
// Capability-gated: on browsers without SpeechRecognition/SpeechSynthesis the
// returned `support` is {false,false} and callers hide the voice UI (graceful
// fallback to text-only chat). Recognition (Chrome/Edge) routes audio to the
// vendor — a known privacy caveat surfaced to the user via a clear toggle.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "@/i18n/types";
import { speechSupport, langToBcp47, stripForSpeech, type SpeechSupport } from "@/lib/chat/voice";

type RecognitionResult = ArrayLike<ArrayLike<{ transcript: string }>>;
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: RecognitionResult }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecogCtor = new () => SpeechRecognitionLike;

function getWindow(): (Window & Record<string, unknown>) | undefined {
  return typeof window !== "undefined" ? (window as unknown as Window & Record<string, unknown>) : undefined;
}

export function useVoice({ lang, onTranscript }: { lang: Lang; onTranscript: (text: string) => void }) {
  const [support, setSupport] = useState<SpeechSupport>({ recognition: false, synthesis: false });
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useEffect(() => {
    setSupport(speechSupport(getWindow()));
  }, []);

  const startListening = useCallback(() => {
    const win = getWindow();
    if (!win) return;
    const Ctor = (win.SpeechRecognition ?? win.webkitSpeechRecognition) as RecogCtor | undefined;
    if (!Ctor) return;
    try { recRef.current?.stop(); } catch { /* no active session */ }
    const rec = new Ctor();
    rec.lang = langToBcp47(lang);
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      const text = Array.from(e.results, (r) => r[0]?.transcript ?? "").join(" ").trim();
      if (text) onTranscriptRef.current(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  }, [lang]);

  const stopListening = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* already stopped */ }
    setListening(false);
  }, []);

  const speak = useCallback((md: string) => {
    const win = getWindow();
    const synth = win?.speechSynthesis as SpeechSynthesis | undefined;
    if (!synth) return;
    const text = stripForSpeech(md);
    if (!text) return;
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = langToBcp47(lang);
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      synth.speak(u);
    } catch { setSpeaking(false); }
  }, [lang]);

  const cancelSpeak = useCallback(() => {
    try { getWindow()?.speechSynthesis?.cancel(); } catch { /* nothing speaking */ }
    setSpeaking(false);
  }, []);

  // Stop mic + TTS on unmount.
  useEffect(
    () => () => {
      try {
        recRef.current?.stop();
        getWindow()?.speechSynthesis?.cancel();
      } catch { /* ignore */ }
    },
    [],
  );

  return { support, listening, speaking, startListening, stopListening, speak, cancelSpeak };
}
