'use client';

import { useEffect, type RefObject } from 'react';

// The persistent dot/particle "Aurora" layer — 3 depth tiers (crisp stars with
// core+halo, soft motes, big out-of-focus bokeh), blue-ocean + cyan hue split,
// additive glow, mouse parallax. Ported from the validated brainstorming POC.
// Guards for a missing 2D context (jsdom) so it is a safe no-op under tests.

interface P {
  k: 's' | 'm' | 'b';
  d: number; r: number; h: number; s: number; l: number; a: number; tb: number; ta: number;
  x: number; y: number; vx: number; vy: number; sa: number; sp: number; ss: number; tp: number; ts: number;
}

export function useDotField(canvasRef: RefObject<HTMLCanvasElement | null>): void {
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
    const mk = (): P => {
      const roll = Math.random();
      let k: P['k'], d: number, rad: number, a: number, tb: number, ta: number;
      if (roll < 0.6) { k = 's'; d = rand(0, 0.2); rad = rand(1.8, 4); a = rand(0.78, 1); tb = 0.55; ta = 0.45; }
      else if (roll < 0.85) { k = 'm'; d = rand(0.32, 0.6); rad = rand(6, 16); a = rand(0.18, 0.34); tb = 0.7; ta = 0.3; }
      else { k = 'b'; d = rand(0.82, 1); rad = rand(26, 86); a = rand(0.06, 0.13); tb = 0.86; ta = 0.14; }
      const col = color(k === 's');
      return {
        k, d, r: rad * DPR, h: col.h, s: col.s, l: col.l, a, tb, ta,
        x: rand(0, W), y: rand(0, H), vx: (rand(3, 9) + d * rand(15, 30)) * DPR, vy: rand(-5, 5) * DPR,
        sa: (2 + d * 15) * DPR, sp: rand(0, 6.28), ss: rand(0.12, 0.4), tp: rand(0, 6.28),
        ts: k === 's' ? rand(0.6, 1.7) : rand(0.25, 0.7),
      };
    };
    const build = () => {
      const n = Math.round(Math.min(120, (innerWidth * innerHeight) / 13000));
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
      const tw = p.tb + p.ta * Math.sin(t * p.ts + p.tp);
      const a = p.a * tw;
      if (a <= 0.002) return;
      const px = p.x + (m.x - 0.5) * 70 * DPR * p.d;
      const py = p.y + (m.y - 0.5) * 50 * DPR * p.d + Math.sin(t * p.ss + p.sp) * p.sa;
      const col = (al: number) => `hsla(${p.h},${p.s}%,${p.l}%,${al})`;
      if (p.k === 's') {
        let g = c.createRadialGradient(px, py, 0, px, py, p.r * 4.4);
        g.addColorStop(0, col(a * 0.42)); g.addColorStop(0.4, col(a * 0.12)); g.addColorStop(1, col(0));
        c.fillStyle = g; c.beginPath(); c.arc(px, py, p.r * 4.4, 0, 6.28); c.fill();
        g = c.createRadialGradient(px, py, 0, px, py, p.r);
        g.addColorStop(0, col(Math.min(1, a * 1.3))); g.addColorStop(0.5, col(a * 0.6)); g.addColorStop(1, col(0));
        c.fillStyle = g; c.beginPath(); c.arc(px, py, p.r, 0, 6.28); c.fill();
        return;
      }
      const g = c.createRadialGradient(px, py, 0, px, py, p.r);
      if (p.k === 'm') { g.addColorStop(0, col(a * 0.9)); g.addColorStop(0.5, col(a * 0.34)); g.addColorStop(1, col(0)); }
      else { g.addColorStop(0, col(a * 0.55)); g.addColorStop(0.62, col(a * 0.42)); g.addColorStop(0.9, col(a * 0.64)); g.addColorStop(1, col(0)); }
      c.fillStyle = g; c.beginPath(); c.arc(px, py, p.r, 0, 6.28); c.fill();
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
      raf = requestAnimationFrame(frame);
    };
    const onMove = (e: MouseEvent) => { m.tx = e.clientX / innerWidth; m.ty = e.clientY / innerHeight; };
    const onResize = () => { clearTimeout(rt); rt = setTimeout(resize, 150); };

    resize();
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('resize', onResize);
    if (reduce) { c.globalCompositeOperation = 'lighter'; for (const p of ps) draw(p, 0); }
    else raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(rt);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('resize', onResize);
    };
  }, [canvasRef]);
}
