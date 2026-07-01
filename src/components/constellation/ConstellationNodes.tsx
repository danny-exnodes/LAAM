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
      width: 17,
      height: 17,
      border: "2.5px solid #ffce7a",
      boxShadow: "0 0 16px rgba(255,206,122,.8), inset 0 0 7px rgba(255,206,122,.5)",
    };
  if (tint === "idle")
    return { width: 15, height: 15, border: "1.5px dashed rgba(150,185,210,.5)" };
  return {
    width: 16,
    height: 16,
    border: "2px solid #5bd6ff",
    boxShadow: "0 0 13px rgba(91,214,255,.65), inset 0 0 6px rgba(91,214,255,.5)",
  };
}

const labelColor: Record<string, string> = { gold: "#ffe6b0", cyan: "#a9e9ff", idle: "#6f9bb5" };

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
                transform: outerLeft ? "translate(calc(-100% - 16px), -50%)" : "translate(16px, -50%)",
                color: labelColor[tint],
              }}
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
