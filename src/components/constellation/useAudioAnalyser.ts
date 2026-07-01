"use client";
import { useRef, useEffect, useCallback } from "react";

export function useAudioAnalyser() {
  const ctxRef = useRef<AudioContext | null>(null);
  const micAnalyser = useRef<AnalyserNode | null>(null);
  const ttsAnalyser = useRef<AnalyserNode | null>(null);
  const ttsSource = useRef<MediaElementAudioSourceNode | null>(null);
  const micStream = useRef<MediaStream | null>(null);
  const buf = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(512) as Uint8Array<ArrayBuffer>);
  const smooth = useRef({ mic: 0.06, tts: 0 });

  const ensure = useCallback(() => {
    if (typeof window === "undefined") return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!ctxRef.current && Ctx) ctxRef.current = new Ctx();
    if (ctxRef.current?.state === "suspended") void ctxRef.current.resume();
  }, []);

  const startMic = useCallback(async () => {
    if (typeof navigator === "undefined") return;
    ensure();
    if (!navigator.mediaDevices?.getUserMedia || !ctxRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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

  const attachTts = useCallback((el: HTMLAudioElement) => {
    ensure();
    const ctx = ctxRef.current;
    if (!ctx) return;
    try {
      ttsSource.current?.disconnect();
      ttsAnalyser.current?.disconnect();
    } catch { /* ignore */ }
    ttsSource.current = null;
    ttsAnalyser.current = null;
    try {
      const src = ctx.createMediaElementSource(el);
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      an.connect(ctx.destination);
      ttsSource.current = src;
      ttsAnalyser.current = an;
    } catch {
      ttsSource.current = null;
      ttsAnalyser.current = null;
    }
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

  useEffect(() => () => {
    stopMic();
    try { ttsSource.current?.disconnect(); ttsAnalyser.current?.disconnect(); } catch {}
    void ctxRef.current?.close();
  }, [stopMic]);
  return { ensure, startMic, stopMic, attachTts, sample };
}
