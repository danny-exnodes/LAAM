"use client";

// VoiceWave — a small decorative SVG waveform shown while the assistant is
// listening or speaking (the "SPEAKING" bars in the command-center). Purely
// presentational and dependency-free (no canvas/AnalyserNode): a row of bars
// animated via the shared .voice-wave-bar keyframe, which is disabled under
// prefers-reduced-motion (so it renders as a static equalizer for motion-
// sensitive users). aria-hidden — the listening/speaking status is announced
// by sibling text in the Constellation.

const BARS = 9;

export function VoiceWave({ active, color = "var(--accent)" }: { active: boolean; color?: string }) {
  return (
    <svg viewBox="0 0 36 16" width={48} height={20} aria-hidden role="presentation">
      {Array.from({ length: BARS }, (_, i) => {
        // Symmetric height profile (taller in the middle), animated when active.
        const base = 3 + Math.round(6 * Math.sin((Math.PI * (i + 1)) / (BARS + 1)));
        return (
          <rect
            key={i}
            x={i * 4 + 1}
            y={8 - base / 2}
            width={2}
            height={base}
            rx={1}
            fill={color}
            className={active ? "voice-wave-bar" : undefined}
            style={active ? { animationDelay: `${i * 90}ms` } : { opacity: 0.35 }}
          />
        );
      })}
    </svg>
  );
}
