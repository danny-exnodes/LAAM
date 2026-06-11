"use client";

// Shared recharts palette that follows the app theme. Dark mode is class-based
// (a `.dark` class on <html>, set by the theme toggle); recharts renders inline
// SVG with literal colors, not CSS classes, so it reads that class (via useIsDark)
// and re-renders when it changes (theme toggle or system change in "system" mode).

import { useIsDark } from "./useIsDark";

export type ChartTheme = {
  grid: string;
  axis: string;
  /** Primary foreground — for an emphasized series that must read on the card bg. */
  text: string;
  /** Theme-aware series colors — must hold ≥3:1 on the chart card bg (WCAG
      1.4.11 non-text). Light darkens the brand cyans (the bright #36a6d6 /
      #0ea5e9 are only 2.77:1 on the white card); dark keeps them. Ratios are
      guarded by src/app/globals-contrast.test.ts. */
  series: {
    /** Brand-cyan series (replaces hardcoded #36a6d6). */
    accent: string;
    /** Sky-blue companion series (replaces hardcoded #0ea5e9). */
    sky: string;
  };
  tooltip: {
    backgroundColor: string;
    border: string;
    borderRadius: number;
    color: string;
    fontSize: number;
  };
};

// Exported (not just module-private) so the contrast guard test can verify them.
export const LIGHT: ChartTheme = {
  grid: "#e5e5ea",
  axis: "#6b7280",
  text: "#111827",
  series: { accent: "#2a8fbf", sky: "#0284c7" },
  tooltip: {
    backgroundColor: "#ffffff",
    border: "1px solid #e5e5ea",
    borderRadius: 8,
    color: "#111827",
    fontSize: 12,
  },
};

export const DARK: ChartTheme = {
  grid: "#2a2a2a",
  axis: "#9ca3af",
  text: "#f5f5f5",
  series: { accent: "#36a6d6", sky: "#0ea5e9" },
  tooltip: {
    backgroundColor: "#171717",
    border: "1px solid #404040",
    borderRadius: 8,
    color: "#f5f5f5",
    fontSize: 12,
  },
};

export function useChartTheme(): ChartTheme {
  return useIsDark() ? DARK : LIGHT;
}
