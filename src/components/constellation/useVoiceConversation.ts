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
  updateRecentMaxTts,
  BARGE_IN_BASE,
  BARGE_IN_TTS_K,
  BARGE_IN_MIN_SPEECH_MS,
  BARGE_IN_DECAY_RATE,
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
    // TEMP diagnostic (see VAD effect below) — pins down exactly which event drives an
    // unexpected transition (e.g. "flips to listening while Jarvis is still talking"
    // must be speakingEnded or bargeIn; this shows which, plus isSpeaking at that instant).
    console.log("[barge-in spike] dispatch", {
      event,
      prev,
      next,
      isSpeaking: optsRef.current.isSpeaking,
      isPreparingSpeech: optsRef.current.isPreparingSpeech,
      isReplying: optsRef.current.isReplying,
    });

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

    // MicVAD only needs to run during `speaking` (barge-in detection). Pausing it
    // outside that window removes a third concurrent mic consumer (alongside the
    // analyser and Web Speech's own capture) exactly when `listening` needs Web
    // Speech to start reliably — the device-contention risk the plan flagged, left
    // as a documented fallback ("pause MicVAD outside speaking"). `vadRef` is
    // declared later in this hook but is a stable ref object, so referencing
    // `.current` here (only ever read when this closure is actually INVOKED, well
    // after the whole hook body has run once) is safe.
    if (next === "speaking") void vadRef.current?.start();
    else if (prev === "speaking") void vadRef.current?.pause();
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

  // Silero VAD — barge-in ONLY. Created once while enabled, destroyed on disable/unmount;
  // paused/resumed by `dispatch` above so its own mic capture only runs during `speaking`
  // (see the pause/resume block there). Barge-in uses a leaky-bucket accumulator, not a
  // streak timer: Gate A (Silero `vadSpeaking`, from onSpeechStart/End/Misfire) AND Gate B
  // (`passesBargeInGate`, mic loud vs the RECENT-MAX tts — echo-lag-robust) combine into
  // one per-frame pass/fail; a passing frame ADDS to `goodMs` (capped at
  // BARGE_IN_MIN_SPEECH_MS), a failing frame DRAINS it BARGE_IN_DECAY_RATE times faster —
  // see conversation.ts for why (a hard reset-on-any-miss never accumulated real speech's
  // naturally uneven envelope; a "tolerate gaps" streak instead let one loud blip coast a
  // self-interrupt through silence; and the instantaneous-tts gate let delayed speaker
  // echo self-interrupt, which the recent-max reference fixes). onFrameProcessed fires
  // every ~30ms frame — the steady clock for the gates AND the recent-max tts decay.
  const vadRef = useRef<MicVAD | null>(null);
  useEffect(() => {
    if (!opts.enabled) return;
    let disposed = false;
    let vadSpeaking = false; // Gate A
    let goodMs = 0; // accrued net "sustained loud speech" duration
    let recentMaxTts = 0; // decaying max tts — the echo-lag-aware reference for Gate B
    let lastFrameAt = 0; // for computing each frame's real elapsed dt

    // TEMP diagnostic — the AEC spike (plan Task 3 Step 5) needs real mic/speaker
    // hardware, which no agent has. Logs so the barge-in gate can be verified/tuned from
    // real numbers. Remove once barge-in is confirmed working.
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
      },
      // Silero segments a continuous interruption into multiple per-phrase spans (a
      // breath or brief pause ends one span, starts another) — `goodMs` is a net
      // accumulator, not a streak, so a brief Gate-A dropout just drains a little
      // rather than wiping all progress; no reset needed here.
      onSpeechEnd: () => {
        vadSpeaking = false;
      },
      onVADMisfire: () => {
        vadSpeaking = false;
      },
      onFrameProcessed: () => {
        if (stateRef.current !== "speaking") {
          goodMs = 0;
          recentMaxTts = 0;
          lastFrameAt = 0;
          return;
        }
        const { mic, tts } = optsRef.current.sample();
        const now = performance.now();
        // Cap dt so a tab-throttled/backgrounded gap (or the first frame) can't inject a
        // huge single accrual or drain step.
        const dt = lastFrameAt ? Math.min(now - lastFrameAt, 100) : 30;
        lastFrameAt = now;
        recentMaxTts = updateRecentMaxTts(recentMaxTts, tts, dt);
        // Gate B compares mic against the recent TTS PEAK (which the currently-arriving
        // echo reflects), not the instantaneous tts (already-decayed → let echo through).
        const passes = vadSpeaking && passesBargeInGate(mic, recentMaxTts);
        goodMs = passes
          ? Math.min(BARGE_IN_MIN_SPEECH_MS, goodMs + dt)
          : Math.max(0, goodMs - dt * BARGE_IN_DECAY_RATE);
        if (now - lastSpikeLog > 400) {
          lastSpikeLog = now;
          console.log("[barge-in spike] frame while speaking", {
            mic,
            tts,
            recentMaxTts,
            vadSpeaking,
            threshold: BARGE_IN_BASE + BARGE_IN_TTS_K * recentMaxTts,
            passes,
            goodMs,
          });
        }
        if (goodMs >= BARGE_IN_MIN_SPEECH_MS) {
          goodMs = 0;
          console.log("[barge-in spike] FIRING bargeIn", { mic, tts, recentMaxTts });
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
        // Only start immediately if we're already `speaking` (e.g. the VAD effect re-ran
        // mid-reply); otherwise stay paused until `dispatch` starts it on entering
        // `speaking`, so `listening` isn't fighting Web Speech for the mic device.
        if (stateRef.current === "speaking") void vad.start();
        console.log(
          "[barge-in spike] MicVAD ready" +
            (stateRef.current === "speaking" ? " — started" : " — paused until speaking"),
        );
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
