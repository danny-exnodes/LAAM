import type { CSSProperties } from "react";

// Bloom — the "blossom" of the Matte Dark language: a soft, decorative radial
// glow placed *behind* opaque surfaces to fake depth (we never use translucency
// or backdrop-blur). Purely cosmetic: always aria-hidden + pointer-events:none
// so it can never trap clicks or be read by assistive tech. It also rides the
// shared `.anim-glow` keyframe, which is disabled under prefers-reduced-motion.

type BloomPosition = "top" | "top-right" | "top-left" | "center" | "bottom";

const POSITION: Record<BloomPosition, { x: string; y: string }> = {
  top: { x: "50%", y: "0%" },
  "top-right": { x: "100%", y: "0%" },
  "top-left": { x: "0%", y: "0%" },
  center: { x: "50%", y: "50%" },
  bottom: { x: "50%", y: "100%" },
};

export function Bloom({
  color = "var(--accent-glow)",
  position = "top-right",
  size = "60%",
  className = "",
}: {
  /** CSS color (defaults to the accent glow token). */
  color?: string;
  position?: BloomPosition;
  /** Radius of the radial gradient, as a CSS length/percentage. */
  size?: string;
  className?: string;
}) {
  const { x, y } = POSITION[position];
  const style: CSSProperties = {
    background: `radial-gradient(${size} ${size} at ${x} ${y}, ${color}, transparent 70%)`,
  };
  return (
    <div
      aria-hidden
      className={`anim-glow pointer-events-none absolute inset-0 ${className}`}
      style={style}
    />
  );
}
