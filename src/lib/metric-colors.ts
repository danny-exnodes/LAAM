// Source of truth for metric accent colors (recharts needs literal color values,
// not CSS classes). Mirrors the --metric-* tokens added to globals.css @theme.
// Matte Dark: cool family throughout — system metrics = cyan/aqua, graphics
// metrics = bright cyan/sky. Four distinguishable hues, no warm tones.

export const METRIC_COLORS = {
  cpu: "#36a6d6", // accent (system)
  ram: "#2dd4bf", // aqua (system)
  gpu: "#22d3ee", // --metric-gpu (graphics)
  vram: "#38bdf8", // --metric-vram (graphics)
} as const;

export type MetricKey = keyof typeof METRIC_COLORS;

// Gauge load ramp: brand color normally, amber when busy, red when near-saturated.
export function gaugeColor(base: string, valuePct: number): string {
  if (valuePct >= 92) return "#ef4444";
  if (valuePct >= 80) return "#f59e0b";
  return base;
}
