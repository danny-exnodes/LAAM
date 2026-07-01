"use client";
import { useEffect, useRef } from "react";

type State = "idle" | "listening" | "thinking" | "speaking";

export function AudioWave({ state, sample }: { state: State; sample: () => { mic: number; tts: number } }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state); stateRef.current = state;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const c = ref.current!;
    const ctx2d = c.getContext("2d"); if (!ctx2d) return;
    const ctx = ctx2d;
    let raf = 0, T = 0;
    const bars = 46;
    const amp = new Array(bars).fill(0.06);
    const reduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion:reduce)").matches : false;

    function draw() {
      T++;
      const { mic, tts } = sample();
      const st = stateRef.current;
      const w = c.width, h = c.height, mid = h / 2;
      ctx.clearRect(0, 0, w, h);
      const bw = w / bars;
      for (let i = 0; i < bars; i++) {
        const dist = Math.abs(i - bars / 2) / (bars / 2);
        let tgt = 0.05 + 0.035 * Math.sin(T * 0.05 + i);
        if (st === "speaking") tgt = 0.10 + (0.30 + tts * 0.85) * (1 - dist * 0.7) * Math.abs(0.5 * Math.sin(T * 0.5 + i * 0.8) + 0.5);
        else if (st === "listening") tgt = 0.08 + (1 - dist) * Math.max(mic, 0.1) * 1.2;
        amp[i] += (tgt - amp[i]) * (st === "speaking" ? 0.5 : 0.35);
        const bh = Math.max(2, amp[i] * h);
        ctx.fillStyle = `rgba(255,206,122,${0.5 + amp[i] * 0.5})`;
        ctx.fillRect(i * bw + 1, mid - bh / 2, bw - 2, bh);
      }
      raf = requestAnimationFrame(draw);
    }

    if (reduce) draw(); else raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [sample]);

  return <canvas ref={ref} width={320} height={48} className="block" aria-hidden />;
}
