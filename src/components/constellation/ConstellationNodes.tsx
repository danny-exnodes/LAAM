"use client";
import type { CSSProperties } from "react";
import type { Placed } from "@/lib/constellation/field";
import { nodeTint, type ConstNode } from "@/lib/constellation/nodeModel";
import type { Translator } from "@/i18n/types";

const pct = (v: number) => `${50 + v}%`;

// Ring marker (hollow circle) per tint — matches the prototype's node dots so
// the beams visibly terminate on the ring. The button is centred on the node
// anchor, so the beam (which ends at that anchor) touches it.
function ringStyle(tint: ReturnType<typeof nodeTint>): CSSProperties {
  if (tint === "gold")
    return {
      width: 26,
      height: 26,
      border: "3.5px solid #ffce7a",
      boxShadow: "0 0 26px rgba(255,206,122,.9), 0 0 46px rgba(255,206,122,.4), inset 0 0 10px rgba(255,206,122,.6)",
    };
  if (tint === "idle")
    return { width: 22, height: 22, border: "2px dashed rgba(150,185,210,.5)" };
  return {
    width: 24,
    height: 24,
    border: "3px solid #5bd6ff",
    boxShadow: "0 0 22px rgba(91,214,255,.75), 0 0 40px rgba(91,214,255,.35), inset 0 0 9px rgba(91,214,255,.6)",
  };
}

const labelColor: Record<string, string> = { gold: "#ffe6b0", cyan: "#a9e9ff", idle: "#6f9bb5" };
// Neon-tube text glow per tint — idle nodes stay unlit (no glow) since they're
// intentionally muted/inactive.
const labelGlow: Record<string, string> = {
  gold: "0 0 6px rgba(255,206,122,.9), 0 0 16px rgba(255,206,122,.7), 0 0 32px rgba(255,206,122,.4)",
  cyan: "0 0 6px rgba(91,214,255,.9), 0 0 16px rgba(91,214,255,.7), 0 0 32px rgba(91,214,255,.4)",
  idle: "none",
};

export function ConstellationNodes({
  placed,
  onPick,
  t,
}: {
  placed: Placed[];
  onPick: (n: ConstNode) => void;
  t: Translator;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[5]">
      {placed.map((n) => {
        const tint = nodeTint(n);
        // Label points OUTWARD from the core so it never overlaps the beam.
        const outerLeft = n.x <= 0;
        return (
          <div key={n.id}>
            {/* Ring — centred exactly on the node anchor (beam endpoint) */}
            <button
              type="button"
              onClick={() => onPick(n)}
              aria-label={t("constellation.nodeAria", { name: n.label })}
              style={{ left: pct(n.x), top: pct(n.y), ...ringStyle(tint) }}
              className={
                "pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-transparent transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5bd6ff] " +
                (tint === "gold" ? "anim-glow" : "")
              }
            />
            {/* Label beside the ring, offset to the outer side */}
            <span
              aria-hidden
              style={{
                left: pct(n.x),
                top: pct(n.y),
                transform: outerLeft ? "translate(calc(-100% - 20px), -50%)" : "translate(20px, -50%)",
                color: labelColor[tint],
                textShadow: labelGlow[tint],
              }}
              className="pointer-events-none absolute whitespace-nowrap text-[16px] font-semibold tracking-[0.3px]"
            >
              {n.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
