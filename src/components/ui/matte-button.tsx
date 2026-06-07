import type { ButtonHTMLAttributes } from "react";

// MatteButton — token-driven button for the Matte Dark language. Matte accent
// fill (no gloss/shine), with a mandatory focus-visible ring so keyboard users
// always get a visible focus indicator (a11y is a hard constraint here).

type Variant = "primary" | "ghost" | "subtle";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-[var(--accent)] text-[var(--accent-fg)] hover:bg-[var(--accent-hover)]",
  ghost:
    "border border-[var(--border-strong)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-2)]",
  subtle:
    "bg-[var(--accent-muted)] text-[var(--accent)] hover:bg-[var(--surface-3)]",
};

export function MatteButton({
  variant = "primary",
  className = "",
  ...rest
}: {
  variant?: Variant;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-glow)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)] disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT[variant]} ${className}`}
      {...rest}
    />
  );
}
