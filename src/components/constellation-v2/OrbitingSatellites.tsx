"use client";
import { useEffect, useMemo, useRef } from "react";
import type { CSSProperties } from "react";
import { nodeTint, type ConstNode } from "@/lib/constellation/nodeModel";
import type { Translator } from "@/i18n/types";

// Same nodes/onPick contract as v1's ConstellationNodes, but positioned on
// animated orbits (imperative per-frame DOM updates via refs, NOT React
// state — updating N node positions at 60fps through setState would cause
// a full re-render storm) instead of v1's fixed ring layout.
type OrbitParams = { radiusX: number; radiusY: number; angle0: number; speed: number; dir: 1 | -1 };

// Deterministic per-id hash (0..1) so orbit params are stable across
// re-renders/re-fetches instead of reshuffling every time nodes reload.
function hashUnit(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 10000) / 10000;
}

// `indexInRing`/`countInRing` space starting angles evenly around the orbit
// (plus a little hash jitter so it doesn't look mechanically perfect) — pure
// hash-derived angles (the first attempt) clustered several nodes together
// far too often, since a handful of short similar id strings ("idle:github",
// "idle:trello", …) don't reliably hash to well-spread values.
function orbitParamsFor(node: ConstNode, indexInRing: number, countInRing: number): OrbitParams {
  const hash = hashUnit(node.id);
  const baseRadius = node.ring === "inner" ? 18 : 33;
  const radiusX = baseRadius + hash * 6;
  const radiusY = radiusX * (0.72 + hash * 0.12);
  const evenSpacing = (indexInRing / Math.max(1, countInRing)) * Math.PI * 2;
  return {
    radiusX,
    radiusY,
    angle0: evenSpacing + hash * 0.5,
    speed: 0.04 + hash * 0.05,
    dir: hash > 0.5 ? 1 : -1,
  };
}

const ringStyle = (tint: ReturnType<typeof nodeTint>): CSSProperties => {
  if (tint === "gold")
    return {
      width: 22,
      height: 22,
      border: "3px solid #ffce7a",
      boxShadow: "0 0 22px rgba(255,206,122,.85), 0 0 40px rgba(255,206,122,.35), inset 0 0 8px rgba(255,206,122,.55)",
    };
  if (tint === "idle") return { width: 18, height: 18, border: "1.5px solid rgba(150,185,210,.5)" };
  return {
    width: 20,
    height: 20,
    border: "2.5px solid #5bd6ff",
    boxShadow: "0 0 18px rgba(91,214,255,.7), 0 0 34px rgba(91,214,255,.3), inset 0 0 7px rgba(91,214,255,.5)",
  };
};
const labelColor: Record<string, string> = { gold: "#ffe6b0", cyan: "#a9e9ff", idle: "#6f9bb5" };

export function OrbitingSatellites({
  nodes,
  onPick,
  t,
}: {
  nodes: ConstNode[];
  onPick: (n: ConstNode) => void;
  t: Translator;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const dotRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const labelRefs = useRef<Map<string, HTMLSpanElement>>(new Map());
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const params = useMemo(() => {
    const map = new Map<string, OrbitParams>();
    const countInRing = { inner: nodes.filter((n) => n.ring === "inner").length, outer: nodes.filter((n) => n.ring === "outer").length };
    const seenInRing = { inner: 0, outer: 0 };
    for (const n of nodes) {
      const indexInRing = seenInRing[n.ring]++;
      map.set(n.id, orbitParamsFor(n, indexInRing, countInRing[n.ring]));
    }
    return map;
  }, [nodes]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduce =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion:reduce)").matches
        : false;

    // Container size cached and refreshed only on resize — reading it inside
    // frame() would force a layout read every frame (getBoundingClientRect
    // after we've just written styles = forced synchronous reflow).
    let containerW = mount.clientWidth || 1;
    let containerH = mount.clientHeight || 1;
    const onResize = () => {
      containerW = mount!.clientWidth || 1;
      containerH = mount!.clientHeight || 1;
    };
    window.addEventListener("resize", onResize);

    let raf = 0;
    let t0 = 0;

    function frame() {
      t0 += reduce ? 0 : 0.016;

      for (const n of nodesRef.current) {
        const p = params.get(n.id);
        if (!p) continue;
        const angle = p.angle0 + t0 * p.speed * p.dir;
        const xPx = ((Math.cos(angle) * p.radiusX) / 100) * containerW;
        const yPx = ((Math.sin(angle) * p.radiusY) / 100) * containerH;

        // transform-only updates (left/top would force a layout reflow on
        // every node every frame — see rules/web/performance.md).
        const dot = dotRefs.current.get(n.id);
        const label = labelRefs.current.get(n.id);
        if (dot) dot.style.transform = `translate(-50%, -50%) translate(${xPx}px, ${yPx}px)`;
        if (label) label.style.transform = `translate(-50%, 16px) translate(${xPx}px, ${yPx}px)`;
      }

      raf = requestAnimationFrame(frame);
    }
    // Stop the loop entirely while backgrounded — cheap per-frame DOM writes
    // still add up across ~13 nodes at 60fps for zero visible benefit.
    function onVisibilityChange() {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!raf && !reduce) {
        raf = requestAnimationFrame(frame);
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    if (reduce) frame();
    else if (!document.hidden) raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("resize", onResize);
    };
  }, [params]);

  return (
    <div ref={mountRef} className="pointer-events-none absolute inset-0 z-[5]">
      {nodes.map((n) => {
        const tint = nodeTint(n);
        return (
          <div key={n.id}>
            <button
              ref={(el) => {
                if (el) dotRefs.current.set(n.id, el);
                else dotRefs.current.delete(n.id);
              }}
              type="button"
              onClick={() => onPick(n)}
              aria-label={t("constellation.nodeAria", { name: n.label })}
              style={{ ...ringStyle(tint), left: "50%", top: "50%" }}
              className={
                // transition-colors (NOT the generic `transition`, which
                // defaults to including `transform`) — the per-frame orbit
                // transform must apply instantly; a transitioned transform
                // chases the fast-moving target and desyncs the ring from
                // its own label, which updates transform instantly.
                "pointer-events-auto absolute rounded-full bg-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5bd6ff] " +
                (tint === "gold" ? "anim-glow" : "")
              }
            />
            <span
              ref={(el) => {
                if (el) labelRefs.current.set(n.id, el);
                else labelRefs.current.delete(n.id);
              }}
              aria-hidden
              style={{ color: labelColor[tint], left: "50%", top: "50%" }}
              className="pointer-events-none absolute whitespace-nowrap text-[13px] font-medium tracking-[0.3px]"
            >
              {n.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
