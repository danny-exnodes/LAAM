"use client";
import { useRef, useEffect, useCallback } from "react";
import { TTS_SAMPLE_RATE } from "@/lib/chat/streamingAudio";

export function useAudioAnalyser() {
  const ctxRef = useRef<AudioContext | null>(null);
  const micAnalyser = useRef<AnalyserNode | null>(null);
  const ttsAnalyser = useRef<AnalyserNode | null>(null);
  const micStream = useRef<MediaStream | null>(null);
  const buf = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(512) as Uint8Array<ArrayBuffer>);
  const smooth = useRef({ mic: 0.06, tts: 0 });

  const ensure = useCallback(() => {
    if (typeof window === "undefined") return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!ctxRef.current && Ctx) {
      // Pin the context to the TTS rate. Otherwise it runs at the hardware default
      // (44100 on many Macs) and every streamed AudioBuffer — dozens of small ones per
      // reply — gets resampled INDIVIDUALLY, adding an artifact at each buffer boundary
      // (audible as crackle). Matching rates means no per-buffer resampling at all.
      // Falls back to the default context if the rate isn't supported.
      try {
        ctxRef.current = new Ctx({ sampleRate: TTS_SAMPLE_RATE });
      } catch {
        ctxRef.current = new Ctx();
      }
    }
    if (ctxRef.current?.state === "suspended") void ctxRef.current.resume();
  }, []);

  const startMic = useCallback(async () => {
    if (typeof navigator === "undefined") return;
    ensure();
    if (!navigator.mediaDevices?.getUserMedia || !ctxRef.current) return;
    try {
      // Echo cancellation is load-bearing for barge-in: it removes Jarvis's own TTS
      // (played through ctx.destination) from the mic so the VAD + barge-in gate react
      // to the user, not to Jarvis. noiseSuppression/autoGainControl + mono match the
      // constraints Silero's MicVAD uses, keeping both mic consumers consistent.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      micStream.current = stream;
      const src = ctxRef.current.createMediaStreamSource(stream);
      const an = ctxRef.current.createAnalyser(); an.fftSize = 512;
      src.connect(an); micAnalyser.current = an;
    } catch { /* denied → no metering; caller still shows text */ }
  }, [ensure]);

  const stopMic = useCallback(() => {
    micStream.current?.getTracks().forEach((t) => t.stop());
    micStream.current = null; micAnalyser.current = null;
  }, []);

  // Persistent TTS sink for streamed playback: one AnalyserNode wired analyser ->
  // destination, created once and reused for every reply. Streamed AudioBufferSource
  // nodes connect INTO this analyser (see playPcmStream), so it meters real audio for
  // the ripples. Replaces the old per-<audio> MediaElementAudioSourceNode entirely.
  const getTtsSink = useCallback(() => {
    ensure();
    const ctx = ctxRef.current;
    if (!ctx) return null;
    if (!ttsAnalyser.current) {
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      an.connect(ctx.destination);
      ttsAnalyser.current = an;
    }
    return { context: ctx, analyser: ttsAnalyser.current };
  }, [ensure]);

  const rms = (an: AnalyserNode | null) => {
    if (!an) return 0;
    an.getByteTimeDomainData(buf.current);
    let s = 0; for (let i = 0; i < buf.current.length; i++) { const d = (buf.current[i] - 128) / 128; s += d * d; }
    return Math.min(1, Math.sqrt(s / buf.current.length) * 3.6);
  };

  const sample = useCallback(() => {
    smooth.current.mic += (rms(micAnalyser.current) - smooth.current.mic) * 0.4;
    smooth.current.tts += (rms(ttsAnalyser.current) - smooth.current.tts) * 0.45;
    return { mic: smooth.current.mic, tts: smooth.current.tts };
  }, []);

  // Tear down the audio graph and hand the output device back. Refs are nulled so a
  // later ensure()/getTtsSink() builds a fresh graph (e.g. after a bfcache restore).
  const release = useCallback(() => {
    stopMic();
    try { ttsAnalyser.current?.disconnect(); } catch { /* already disconnected */ }
    const ctx = ctxRef.current;
    ctxRef.current = null;
    ttsAnalyser.current = null;
    // close() rejects if the context is already closed, and not every implementation
    // returns a promise at all — normalise so neither case escapes as an unhandled error.
    try { void Promise.resolve(ctx?.close()).catch(() => { /* already closed */ }); }
    catch { /* already closed */ }
  }, [stopMic]);

  // React effect cleanup does NOT run on a page refresh or navigation — the browser tears
  // the document down instead — so without this the AudioContext and mic stream were left
  // holding the audio output device while the next page load built a new context on top.
  // A cold browser start had no such leftover, which is exactly why refreshing behaved
  // worse than reopening Chrome. `pagehide` fires for both unload and bfcache entry.
  useEffect(() => {
    window.addEventListener("pagehide", release);
    return () => window.removeEventListener("pagehide", release);
  }, [release]);

  useEffect(() => () => release(), [release]);
  return { ensure, startMic, stopMic, getTtsSink, sample };
}
