"use client";

// Shared recharts palette that follows the app theme. Dark mode is class-based
// (a `.dark` class on <html>, set by the theme toggle); recharts renders inline
// SVG with literal colors, not CSS classes, so it reads that class (via useIsDark)
// and re-renders when it changes (theme toggle or system change in "system" mode).

import { useIsDark } from "./useIsDark";

export type ChartTheme = {
  grid: string;
  axis: string;
  tooltip: {
    backgroundColor: string;
    border: string;
    borderRadius: number;
    color: string;
    fontSize: number;
  };
};

const LIGHT: ChartTheme = {
  grid: "#e5e5ea",
  axis: "#6b7280",
  tooltip: {
    backgroundColor: "#ffffff",
    border: "1px solid #e5e5ea",
    borderRadius: 8,
    color: "#111827",
    fontSize: 12,
  },
};

const DARK: ChartTheme = {
  grid: "#2a2a2a",
  axis: "#9ca3af",
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
