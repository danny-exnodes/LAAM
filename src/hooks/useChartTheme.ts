"use client";

// Shared recharts palette that follows the OS color scheme. The app uses
// media-query dark mode (no `.dark` class), so recharts — which renders inline
// SVG with literal colors, not CSS classes — can't use Tailwind `dark:` utils.
// This hook resolves grid/axis/tooltip colors and re-renders on scheme change.

import { useEffect, useState } from "react";

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

function prefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export function useChartTheme(): ChartTheme {
  const [dark, setDark] = useState(prefersDark);
  useEffect(() => {
    // jsdom (and SSR) lack matchMedia — fall back to the light palette there.
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setDark(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return dark ? DARK : LIGHT;
}
