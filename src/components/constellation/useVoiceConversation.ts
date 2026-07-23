"use client";
// Orchestrates the hands-free voice loop: it is the I/O shell around the pure state
// machine in @/lib/chat/conversation. It owns the STT turn lifecycle and the Silero
// VAD (barge-in only), and advances the machine from observable signals (STT final,
// TTS start/stop, VAD onset). All load-bearing decisions live in the tested pure module.
//
// Not unit-tested in jsdom (no AudioContext / Web Speech / VAD worklet) — verified by the
// manual smoke pass in the plan, consistent with useVoice/ConstellationCanvas.

import { useEffect, useRef, useState } from "react";
import { MicVAD } from "@ricky0123/vad-web";
import type { Lang } from "@/i18n/types";
import type { SttProvider } from "@/lib/chat/stt";
import {
  nextConvState,
  shouldSubmit,
  passesBargeInGate,
  BARGE_IN_BASE,
  BARGE_IN_TTS_K,
  BARGE_IN_MIN_SPEECH_MS,
  type ConvState,
  type ConvEvent,
} from "@/lib/chat/conversation";

interface Opts {
  enabled: boolean;
  lang: Lang;
  stt: SttProvider;
  sample: () => { mic: number; tts: number };
  isReplying: boolean;
  // Maps to the caller's `preparingSpeech`: true while a TTS attempt (fetch + prebuffer)
  // is in flight, even before isSpeaking flips true.
  isPreparingSpeech: boolean;
  isSpeaking: boolean;
  onSubmit: (text: string) => void;
  onBargeIn: () => void;
}

export function useVoiceConversation(opts: Opts): { convState: ConvState } {
  const [convState, setConvState] = useState<ConvState>("off");

  // Mirror everything the async callbacks need through refs so the effect wiring never
  // closes over stale values (same pattern as ConstellationClient's other callbacks).
  const stateRef = useRef<ConvState>("off");
  stateRef.current = convState;
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // Central dispatch: run the pure reducer, then perform the side effects that the NEW
  // state requires (start/stop STT). Everything funnels through here so the machine and
  // the I/O never disagree.
  const dispatch = useRef((event: ConvEvent) => {
    const prev = stateRef.current;
    const next = nextConvState(prev, event);
    if (next === prev) return;
    stateRef.current = next;
    setConvState(next);

    const { stt, lang } = optsRef.current;
    if (next === "listening") {
      // Open an STT turn. `onFinal` is a NAMED handler so the empty-result retry reopens
      // the turn with the SAME callback (a fresh no-op callback would make later real
      // utterances never submit — the bug this shape avoids).
      const onFinal = (text: string) => {
        if (stateRef.current !== "listening") return;
        if (shouldSubmit(text)) {
          optsRef.current.onSubmit(text);
          dispatch.current("transcriptFinal");
        } else {
          setTimeout(() => {
            if (stateRef.current === "listening") stt.start(lang, onFinal);
          }, 300);
        }
      };
      stt.start(lang, onFinal);
    } else if (prev === "listening") {
      stt.stop();
    }
  });

  // Enable / disable. If enabling while Jarvis is still speaking (e.g. the load greeting),
  // cut that speech first so we don't open the recognizer on top of his voice.
  useEffect(() => {
    if (opts.enabled && stateRef.current === "off") {
      if (opts.isSpeaking || opts.isPreparingSpeech) opts.onBargeIn();
      dispatch.current("enable");
    }
    if (!opts.enabled && stateRef.current !== "off") dispatch.current("disable");
  }, [opts.enabled]);

  // Observe TTS start/stop → drive thinking→speaking→listening.
  const prevSpeaking = useRef(false);
  useEffect(() => {
    const was = prevSpeaking.current;
    prevSpeaking.current = opts.isSpeaking;
    if (!was && opts.isSpeaking) dispatch.current("speakingStarted");
    if (was && !opts.isSpeaking) dispatch.current("speakingEnded");
  }, [opts.isSpeaking]);

  // A reply that finishes streaming AND finishes its TTS attempt (preparingSpeech) but
  // never actually starts speaking (empty reply, no audio sink, or a genuine TTS failure)
  // must not strand us in `thinking`. Track combined "busy" — still generating reply text,
  // OR still working the TTS call (fetch + prebuffer, which can run several seconds past
  // isReplying going false) — so the safety net only evaluates once BOTH are certain to
  // be done, instead of racing the ~3s neural-TTS prebuffer window (TTS_PREBUFFER_SECONDS
  // in streamingAudio.ts). If speech starts before preparingSpeech clears (the normal
  // path), isSpeaking is already true by the time this effect re-runs, so the guard below
  // is a no-op. Effect cleanup (via the dependency change when preparingSpeech itself
  // flips) cancels a stale timer exactly like it already does for isReplying alone.
  const wasBusy = useRef(false);
  useEffect(() => {
    const busy = opts.isReplying || opts.isPreparingSpeech;
    const was = wasBusy.current;
    wasBusy.current = busy;
    if (was && !busy && stateRef.current === "thinking") {
      const t = setTimeout(() => {
        if (stateRef.current === "thinking" && !optsRef.current.isSpeaking) {
          dispatch.current("replyEndedNoSpeech");
        }
      }, 1200);
      return () => clearTimeout(t);
    }
  }, [opts.isReplying, opts.isPreparingSpeech]);

  // Silero VAD — barge-in ONLY. Created once while enabled, destroyed on disable/unmount.
  // It runs continuously but ACTS only during `speaking`. Barge-in needs BOTH gates held
  // for BARGE_IN_MIN_SPEECH_MS: Gate A = Silero currently hears speech (`vadSpeaking`,
  // maintained from onSpeechStart/End/Misfire); Gate B = mic loud vs current TTS
  // (`passesBargeInGate`, echo-robust). onFrameProcessed fires every ~30ms frame — the
  // steady clock for the sustained-duration check.
  const vadRef = useRef<MicVAD | null>(null);
  useEffect(() => {
    if (!opts.enabled) return;
    let disposed = false;
    let vadSpeaking = false; // Gate A
    let sustainedSince = 0; // when both gates first held together

    // TEMP diagnostic — the AEC spike (plan Task 3 Step 5) needs real mic/speaker
    // hardware, which no agent has. Logs once per Silero speech-onset while Jarvis is
    // speaking, so BARGE_IN_BASE/BARGE_IN_TTS_K in conversation.ts can be tuned from
    // real numbers. Remove once barge-in is confirmed working and thresholds are set.
    let lastSpikeLog = 0;
    void MicVAD.new({
      // Self-hosted (see public/vad/): onnxruntime-web's dynamic import of its wasm
      // loader doesn't resolve through Turbopack/webpack from the library's own default
      // relative paths, 404ing under /_next/static/chunks/ in dev. Absolute paths force
      // plain-fetch loading instead of a bundler-resolved import.
      baseAssetPath: "/vad/",
      onnxWASMBasePath: "/vad/",
      onSpeechStart: () => {
        vadSpeaking = true;
        if (stateRef.current === "speaking") {
          const { mic, tts } = optsRef.current.sample();
          console.log("[barge-in spike] Silero onSpeechStart while speaking", {
            mic,
            tts,
            threshold: BARGE_IN_BASE + BARGE_IN_TTS_K * tts,
            passesGateB: passesBargeInGate(mic, tts),
          });
        }
      },
      onSpeechEnd: () => {
        vadSpeaking = false;
        sustainedSince = 0;
      },
      onVADMisfire: () => {
        vadSpeaking = false;
        sustainedSince = 0;
      },
      onFrameProcessed: () => {
        if (stateRef.current !== "speaking" || !vadSpeaking) {
          sustainedSince = 0;
          return;
        }
        const { mic, tts } = optsRef.current.sample();
        const passes = passesBargeInGate(mic, tts);
        const now = performance.now();
        if (now - lastSpikeLog > 400) {
          lastSpikeLog = now;
          console.log("[barge-in spike] frame while speaking+vadSpeaking", {
            mic,
            tts,
            threshold: BARGE_IN_BASE + BARGE_IN_TTS_K * tts,
            passesGateB: passes,
            sustainedMs: sustainedSince ? now - sustainedSince : 0,
          });
        }
        if (!passes) {
          sustainedSince = 0;
          return;
        }
        if (sustainedSince === 0) sustainedSince = now;
        else if (now - sustainedSince >= BARGE_IN_MIN_SPEECH_MS) {
          sustainedSince = 0;
          optsRef.current.onBargeIn();
          dispatch.current("bargeIn");
        }
      },
    })
      .then((vad) => {
        if (disposed) {
          vad.destroy();
          return;
        }
        vadRef.current = vad;
        void vad.start();
        console.log("[barge-in spike] MicVAD started — barge-in armed");
      })
      .catch((err) => {
        // TEMP diagnostic (see above) — fail soft either way, but log WHY so a silent
        // barge-in failure is distinguishable from "threshold too strict".
        console.log("[barge-in spike] MicVAD failed to start — barge-in unavailable", err);
      });

    return () => {
      disposed = true;
      try {
        vadRef.current?.destroy();
      } catch {
        /* already gone */
      }
      vadRef.current = null;
    };
  }, [opts.enabled]);

  // Teardown STT when the machine leaves the conversation entirely.
  useEffect(() => {
    if (convState === "off") optsRef.current.stt.stop();
  }, [convState]);

  return { convState };
}
