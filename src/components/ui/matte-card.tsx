import type { HTMLAttributes, ReactNode } from "react";

// MatteCard — the core surface of the Matte Dark language. Deliberately OPAQUE
// and matte (no backdrop-blur / no translucency): depth is provided by an
// optional <Bloom> rendered behind the content, not by frosted glass. This is
// the load-bearing primitive — restyling the whole app means editing the
// surface tokens it consumes, not the 100+ call sites.

type Tone = "default" | "accent" | "warn";
type Pad = "none" | "sm" | "md" | "lg";

const PAD: Record<Pad, string> = {
  none: "",
  sm: "p-3",
  md: "p-5",
  lg: "p-7",
};

const TONE_BORDER: Record<Tone, string> = {
  default: "border-[var(--border-subtle)]",
  accent: "border-[var(--accent-glow)]",
  warn: "border-amber-400/30",
};

export function MatteCard({
  children,
  tone = "default",
  pad = "md",
  bloom,
  className = "",
  ...rest
}: {
  children?: ReactNode;
  tone?: Tone;
  pad?: Pad;
  /** Optional decorative <Bloom> element rendered behind the content. */
  bloom?: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border bg-[var(--surface-1)] text-[var(--text-primary)] ${TONE_BORDER[tone]} ${PAD[pad]} ${className}`}
      {...rest}
    >
      {bloom}
      <div className="relative">{children}</div>
    </div>
  );
}
