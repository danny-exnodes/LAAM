'use client';

import { useEffect, type RefObject } from 'react';

// The persistent dot/particle "Aurora" layer — 3 depth tiers (crisp stars with
// core+halo, soft motes, big out-of-focus bokeh), blue-ocean + cyan hue split,
// additive glow, mouse parallax. Ported from the validated brainstorming POC.
// Guards for a missing 2D context (jsdom) so it is a safe no-op under tests.
//
// perf-3: Gradients are baked into offscreen sprite canvases once at particle
// creation time. Per-frame draw becomes drawImage + globalAlpha — no gradient
// object allocation per frame. Bokeh sprites ('b') are rendered at ¼ resolution.
//
// rsp-8: Height-only resize (mobile URL-bar collapse) keeps the particle field
// and only resizes the canvas bitmap, avoiding a visible mid-scroll "jump".

interface P {
  k: 's' | 'm' | 'b';
  d: number; r: number; h: number; s: number; l: number; a: number; tb: number; ta: number;
  x: number; y: number; vx: number; vy: number; sa: number; sp: number; ss: number; tp: number; ts: number;
  /** Pre-rendered sprite (gradients baked once — perf-3) + its draw radius. */
  spr: HTMLCanvasElement | null; sprR: number;
}

export function useDotField(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  { density = 1, alpha = 1, speed = 1 }: { density?: number; alpha?: number; speed?: number } = {},
): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d', { alpha: true });
    } catch {
      return; // jsdom / unsupported
    }
    if (!ctx) return;
    const c = ctx; // narrowed, non-null in closures
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    let W = 0, H = 0, DPR = 1, ps: P[] = [], raf = 0, last = 0;
    let rt: ReturnType<typeof setTimeout> | undefined;
    const m = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    const color = (bright: boolean) => {
      const r = Math.random();
      if (r < 0.62) return { h: rand(208, 222), s: rand(72, 92), l: rand(58, 78) + (bright ? 6 : 0) };
      if (r < 0.86) return { h: rand(190, 200), s: rand(80, 95), l: rand(66, 84) + (bright ? 6 : 0) };
      return { h: rand(204, 216), s: rand(18, 46), l: rand(86, 96) };
    };

    /** Bake particle gradients into an offscreen sprite canvas (perf-3). */
    const sprite = (p: Omit<P, 'spr' | 'sprR'>): { spr: HTMLCanvasElement | null; sprR: number } => {
      const sprR = p.k === 's' ? p.r * 4.4 : p.r;
      const down = p.k === 'b' ? 4 : 1;
      const size = Math.max(2, Math.ceil((sprR * 2) / down));
      let sc: CanvasRenderingContext2D | null = null;
      try {
        const offscreen = document.createElement('canvas');
        offscreen.width = size;
        offscreen.height = size;
        sc = offscreen.getContext('2d');
        if (!sc) return { spr: null, sprR };
        const cx = size / 2;
        const r = sprR / down;
        const col = (al: number) => `hsla(${p.h},${p.s}%,${p.l}%,${al})`;
        const blob = (radius: number, stops: [number, string][]) => {
          const g = sc!.createRadialGradient(cx, cx, 0, cx, cx, radius);
          for (const [pos, clr] of stops) g.addColorStop(pos, clr);
          sc!.fillStyle = g;
          sc!.beginPath();
          sc!.arc(cx, cx, radius, 0, 6.28);
          sc!.fill();
        };
        if (p.k === 's') {
          blob(r, [[0, col(0.42)], [0.4, col(0.12)], [1, col(0)]]);
          blob(p.r / down, [[0, col(1)], [0.5, col(0.6)], [1, col(0)]]);
        } else if (p.k === 'm') {
          blob(r, [[0, col(0.9)], [0.5, col(0.34)], [1, col(0)]]);
        } else {
          blob(r, [[0, col(0.55)], [0.62, col(0.42)], [0.9, col(0.64)], [1, col(0)]]);
        }
        return { spr: sc.canvas, sprR };
      } catch {
        return { spr: null, sprR };
      }
    };

    const mk = (): P => {
      const roll = Math.random();
      let k: P['k'], d: number, rad: number, a: number, tb: number, ta: number;
      if (roll < 0.6) { k = 's'; d = rand(0, 0.2); rad = rand(1.8, 4); a = rand(0.78, 1); tb = 0.55; ta = 0.45; }
      else if (roll < 0.85) { k = 'm'; d = rand(0.32, 0.6); rad = rand(6, 16); a = rand(0.18, 0.34); tb = 0.7; ta = 0.3; }
      else { k = 'b'; d = rand(0.82, 1); rad = rand(26, 86); a = rand(0.06, 0.13); tb = 0.86; ta = 0.14; }
      const col = color(k === 's');
      const base = {
        k, d, r: rad * DPR, h: col.h, s: col.s, l: col.l, a, tb, ta,
        x: rand(0, W), y: rand(0, H), vx: (rand(3, 9) + d * rand(15, 30)) * DPR * speed, vy: rand(-5, 5) * DPR * speed,
        sa: (2 + d * 15) * DPR, sp: rand(0, 6.28), ss: rand(0.12, 0.4), tp: rand(0, 6.28),
        ts: k === 's' ? rand(0.6, 1.7) : rand(0.25, 0.7),
      };
      return { ...base, ...sprite(base) };
    };
    const build = () => {
      const n = Math.round(Math.min(120, (innerWidth * innerHeight) / 13000) * density);
      ps = [];
      for (let i = 0; i < n; i++) ps.push(mk());
    };
    const resize = () => {
      DPR = Math.min(devicePixelRatio || 1, 2);
      W = canvas.width = Math.floor(innerWidth * DPR);
      H = canvas.height = Math.floor(innerHeight * DPR);
      canvas.style.width = innerWidth + 'px';
      canvas.style.height = innerHeight + 'px';
      build();
    };
    const draw = (p: P, t: number) => {
      if (!p.spr) return;
      const tw = p.tb + p.ta * Math.sin(t * p.ts + p.tp);
      const a = p.a * tw * alpha;
      if (a <= 0.002) return;
      const px = p.x + (m.x - 0.5) * 70 * DPR * p.d;
      const py = p.y + (m.y - 0.5) * 50 * DPR * p.d + Math.sin(t * p.ss + p.sp) * p.sa;
      c.globalAlpha = Math.min(1, p.k === 's' ? a * 1.3 : a);
      c.drawImage(p.spr, px - p.sprR, py - p.sprR, p.sprR * 2, p.sprR * 2);
    };
    const upd = (p: P, dt: number) => {
      p.x += p.vx * dt; p.y += p.vy * dt;
      const mm = p.r + 4 * DPR;
      if (p.x - mm > W) { p.x = -mm; p.y = rand(0, H); } else if (p.x + mm < 0) { p.x = W + mm; p.y = rand(0, H); }
      if (p.y - mm > H) p.y = -mm; else if (p.y + mm < 0) p.y = H + mm;
    };
    const frame = (now: number) => {
      const t = now / 1000;
      let dt = (now - last) / 1000;
      last = now;
      if (!dt || dt > 0.1) dt = 0.016;
      m.x += (m.tx - m.x) * 0.05; m.y += (m.ty - m.y) * 0.05;
      c.clearRect(0, 0, W, H);
      c.globalCompositeOperation = 'lighter';
      for (const p of ps) { if (!reduce) upd(p, dt); draw(p, t); }
      c.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };
    const onMove = (e: MouseEvent) => { m.tx = e.clientX / innerWidth; m.ty = e.clientY / innerHeight; };
    const onResize = () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        const newW = Math.floor(innerWidth * Math.min(devicePixelRatio || 1, 2));
        if (newW !== W) { resize(); return; }
        // Height-only resize (mobile URL bar collapse): keep the particle field —
        // a full rebuild re-randomizes mid-scroll. Canvas resize clears the bitmap
        // and resets ctx state, so reduced-motion redraws its static frame.
        DPR = Math.min(devicePixelRatio || 1, 2);
        H = canvas.height = Math.floor(innerHeight * DPR);
        canvas.style.height = innerHeight + 'px';
        if (reduce) { c.globalCompositeOperation = 'lighter'; for (const p of ps) draw(p, 0); c.globalAlpha = 1; }
      }, 150);
    };

    resize();
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('resize', onResize);
    if (reduce) {
      c.globalCompositeOperation = 'lighter';
      for (const p of ps) draw(p, 0);
      c.globalAlpha = 1;
    }
    else raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(rt);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('resize', onResize);
    };
  }, [canvasRef, density, alpha, speed]);
}
