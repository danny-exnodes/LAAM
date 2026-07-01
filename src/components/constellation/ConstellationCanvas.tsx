"use client";
import { useEffect, useRef } from "react";
import type { Placed } from "@/lib/constellation/field";

// Bezier point on a quadratic curve: p0→p1 (control)→p2, parameter t ∈ [0,1]
function bez(t: number, p0: number, p1: number, p2: number): number {
  const u = 1 - t;
  return u * u * p0 + 2 * u * t * p1 + t * t * p2;
}

export function ConstellationCanvas({
  placed,
  getLevel,
}: {
  placed: Placed[];
  getLevel: () => number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Keep a fresh reference to the placed array without re-running the effect
  const placedRef = useRef(placed);
  placedRef.current = placed;
  // Mirror getLevel through a ref so the rAF loop never closes over a stale prop
  const getLevelRef = useRef(getLevel);
  getLevelRef.current = getLevel;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const reduce =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion:reduce)").matches
        : false;
    const canvas = ref.current!;
    const ctxRaw = canvas.getContext("2d");
    // jsdom guard: getContext("2d") returns null in test environments
    if (!ctxRaw) return;
    // Assign to a non-nullable name so TypeScript can track it inside closures
    const ctx: CanvasRenderingContext2D = ctxRaw;

    const DPR = Math.min(window.devicePixelRatio || 1, 1.6);
    let raf = 0,
      T = 0,
      W = 0,
      H = 0,
      cx = 0,
      cy = 0,
      scale = 0,
      coreR = 0;

    // Swarm particles: each orbits the core at varying radius/speed/phase
    let swarm: { a: number; r: number; sp: number; ph: number; size: number }[] = [];

    // Energy flows travelling along the connection beams
    // Each flow stores: node index (into placedRef.current), bezier t, speed,
    // and its cached beam control points (_b)
    const flows: { ni: number; t: number; sp: number; _b: number[] | null }[] = [];

    // Ripples: expanding gold rings from the core
    const ripples: { t: number; str: number }[] = [];
    let rippleCD = 0;

    // Node count the flows were last built for. buildFlows() runs at mount when
    // `placed` is still empty (data not loaded), yielding 0 flows; without this
    // the flow dots only appear after a resize. Rebuild when the count changes.
    let flowNodeCount = -1;

    function layout() {
      W = canvas.width = innerWidth * DPR;
      H = canvas.height = innerHeight * DPR;
      canvas.style.width = innerWidth + "px";
      canvas.style.height = innerHeight + "px";
      cx = W / 2;
      cy = H * 0.5;
      scale = Math.min(W, H * 1.18) * 0.3;
      coreR = Math.min(W, H) * 0.115;
    }

    function buildSwarm() {
      swarm = [];
      const n = reduce ? 220 : Math.round(600 * (DPR > 1.2 ? 1 : 0.85));
      for (let i = 0; i < n; i++) {
        swarm.push({
          a: Math.random() * 6.28,
          r: Math.pow(Math.random(), 0.6),
          sp: Math.random() * 0.5 + 0.5,
          ph: Math.random() * 6.28,
          size: Math.random() * 1.4 + 0.5,
        });
      }
    }

    function buildFlows() {
      flows.length = 0;
      const nodes = placedRef.current;
      const c = reduce ? 0 : 2;
      for (let ni = 0; ni < nodes.length; ni++) {
        for (let i = 0; i < c; i++) {
          flows.push({ ni, t: Math.random(), sp: 0.0016 + Math.random() * 0.0016, _b: null });
        }
      }
    }

    function spawnRipple(str: number) {
      if (ripples.length < 16) ripples.push({ t: 0, str: Math.min(1.3, str) });
    }

    layout();
    buildSwarm();
    buildFlows();

    const onResize = () => {
      layout();
      buildSwarm();
      buildFlows();
    };
    addEventListener("resize", onResize);

    // Per-node flash values (keyed by node id for stability across placed changes)
    const flashMap = new Map<string, number>();

    // Periodic random flash on non-idle nodes (matches prototype's setInterval at 2600ms)
    const flashInterval: ReturnType<typeof setInterval> | null = reduce
      ? null
      : setInterval(() => {
          const nodes = placedRef.current;
          const candidates = nodes.filter((n) => n.state !== "idle");
          if (candidates.length) {
            const pick = candidates[Math.floor(Math.random() * candidates.length)];
            flashMap.set(pick.id, 1);
          }
        }, 2600);

    function frame() {
      T++;
      const level = getLevelRef.current();

      ctx.clearRect(0, 0, W, H);

      const nodes = placedRef.current;

      // Flows were built at mount (possibly with 0 nodes); rebuild the moment the
      // node set changes so the travelling dots appear as soon as data loads.
      if (nodes.length !== flowNodeCount) {
        buildFlows();
        flowNodeCount = nodes.length;
      }

      // ---- connection beams: core → each placed node ----
      // Ported from prototype lines 317–327 (NODES.forEach connection lines block)
      for (let ni = 0; ni < nodes.length; ni++) {
        const p = nodes[ni];
        // Map node coords to the SAME screen position as the HTML node pills
        // (ConstellationNodes uses left:(50+x)% of width, top:(50+y)% of height),
        // so the beams actually connect the core to each visible node.
        const px = cx + (p.x / 100) * W;
        const py = cy + (p.y / 100) * H;

        const dx = px - cx,
          dy = py - cy;
        const d = Math.hypot(dx, dy) || 1;
        const ux = dx / d,
          uy = dy / d;

        const sx = cx + ux * coreR * 1.05;
        const sy = cy + uy * coreR * 1.05;
        const ex = px - ux * 15 * DPR;
        const ey = py - uy * 15 * DPR;

        const mx = (sx + ex) / 2,
          my = (sy + ey) / 2;
        // Prototype uses n.nx * n.ny to determine curve direction; here use sign of x*y
        const perp = p.x * p.y > 0 ? 1 : -1;
        const cxp = mx + -uy * d * 0.22 * perp;
        const cyp = my + ux * d * 0.22 * perp;

        const flash = flashMap.get(p.id) ?? 0;
        const act = p.state === "active";

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(cxp, cyp, ex, ey);
        ctx.lineWidth = (act ? 1.8 : 1.2) * DPR;
        // Brighter than the prototype's base so the core→node connection reads
        // clearly against the swarm/glow; a soft glow reinforces the link.
        ctx.strokeStyle = act
          ? `rgba(255,206,122,${0.5 + flash * 0.4})`
          : `rgba(91,214,255,${0.34 + flash * 0.35})`;
        ctx.shadowBlur = (act ? 6 : 3) * DPR;
        ctx.shadowColor = act ? "#ffce7a" : "#5bd6ff";
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Store beam control points for energy flows
        // We look them up by node index in flows, so store in a parallel array
        // Cache is updated each frame (nodes may change position after resize)
        for (const f of flows) {
          if (f.ni === ni) f._b = [sx, sy, cxp, cyp, ex, ey];
        }

        if (flash) flashMap.set(p.id, flash * 0.94);
      }

      // ---- ambient arc sweeps (prototype lines 328–331) ----
      if (!reduce) {
        for (let k = 0; k < 8; k++) {
          const a0 = T * 0.002 + k * 0.8;
          const a1 = a0 + 2.4 + Math.sin(T * 0.003 + k);
          const r0 = coreR * 1.2;
          const r1 = scale * (1.1 + 0.3 * Math.sin(k));
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0);
          ctx.quadraticCurveTo(
            cx + Math.cos((a0 + a1) / 2) * r1 * 1.3,
            cy + Math.sin((a0 + a1) / 2) * r1 * 1.3,
            cx + Math.cos(a1) * r0,
            cy + Math.sin(a1) * r0,
          );
          ctx.lineWidth = 0.6 * DPR;
          ctx.strokeStyle = "rgba(91,214,255,.07)";
          ctx.stroke();
        }
      }

      // ---- energy flows along beams (prototype lines 332–335) ----
      for (const f of flows) {
        f.t -= f.sp * (0.6 + level);
        if (f.t < 0) f.t += 1;
        if (!f._b) continue;
        const b = f._b;
        const x = bez(f.t, b[0], b[2], b[4]);
        const y = bez(f.t, b[1], b[3], b[5]);
        const node = nodes[f.ni];
        const act = node?.state === "active";
        ctx.beginPath();
        ctx.arc(x, y, 1.7 * DPR, 0, 6.3);
        ctx.fillStyle = act ? "rgba(255,217,143,.9)" : "rgba(169,233,255,.85)";
        ctx.shadowBlur = 8 * DPR;
        ctx.shadowColor = act ? "#ffce7a" : "#5bd6ff";
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // ---- swarm (prototype lines 337–343) ----
      const rot = T * 0.0016;
      for (let i = 0; i < swarm.length; i++) {
        const p = swarm[i];
        const aa = p.a + rot * p.sp;
        const wob = reduce ? 0 : Math.sin(T * 0.05 * p.sp + p.ph) * 0.04;
        const rr = (p.r + wob) * coreR * 0.92;
        const x = cx + Math.cos(aa) * rr;
        const y = cy + Math.sin(aa) * rr;
        const al = (1 - p.r * 0.7) * (0.5 + level * 0.5);
        ctx.beginPath();
        ctx.arc(x, y, p.size * DPR, 0, 6.3);
        ctx.fillStyle = `rgba(${150 + p.r * 60},${210 + p.r * 30},255,${al})`;
        ctx.fill();
      }

      // ---- inner glow (prototype lines 345–347) ----
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
      g.addColorStop(0, `rgba(120,200,255,${0.1 + level * 0.16})`);
      g.addColorStop(0.7, "rgba(40,110,170,.05)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 1.1, 0, 6.3);
      ctx.fill();

      // ---- spawn ripples (prototype lines 349–352) ----
      // Level is real audio amplitude now: emit ripples from the core when it
      // rises (listening/speaking) so the gold ring visibly "waves" with voice;
      // fall back to a gentle idle breath-ripple at rest.
      rippleCD--;
      if (level > 0.3 && rippleCD <= 0) {
        spawnRipple(0.4 + level * 0.8);
        rippleCD = 6;
      } else if (T % 150 === 0) {
        spawnRipple(0.22); // idle breath pulse
      }

      // ---- draw ripples (prototype lines 354–357) ----
      for (let ri = ripples.length - 1; ri >= 0; ri--) {
        const rp = ripples[ri];
        rp.t += 0.014;
        if (rp.t >= 1) {
          ripples.splice(ri, 1);
          continue;
        }
        const rad = coreR * (1.02 + rp.t * 2.0);
        const a = (1 - rp.t) * (1 - rp.t) * 0.5 * rp.str;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, 6.3);
        ctx.lineWidth = (2.4 * (1 - rp.t) + 0.4) * DPR;
        ctx.strokeStyle = `rgba(255,206,122,${a})`;
        ctx.stroke();
      }

      // ---- GOLD CORE RING (prototype lines 359–361) ----
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, 6.3);
      ctx.lineWidth = (4 + level * 5) * DPR;
      ctx.strokeStyle = "rgba(255,206,122,.9)";
      ctx.shadowBlur = (16 + level * 26) * DPR;
      ctx.shadowColor = "#ffce7a";
      ctx.stroke();
      ctx.shadowBlur = 0;
      // outer faint halo ring
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 1.13, 0, 6.3);
      ctx.lineWidth = 1 * DPR;
      ctx.strokeStyle = "rgba(255,206,122,.16)";
      ctx.stroke();

    }

    // Outer driver: schedules frame() then re-queues itself — one chain only
    function loop() {
      frame();
      raf = requestAnimationFrame(loop);
    }

    // Reduced-motion: draw exactly one static frame; no loop.
    // Full-motion: start the loop once.
    if (reduce) frame(); else raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("resize", onResize);
      if (flashInterval) clearInterval(flashInterval);
    };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 z-0" aria-hidden />;
}
