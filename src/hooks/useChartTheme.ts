"use client";

// Shared recharts palette that follows the app theme. Dark mode is class-based
// (a `.dark` class on <html>, set by the theme toggle); recharts renders inline
// SVG with literal colors, not CSS classes, so this hook reads that class and
// re-renders when it changes (theme toggle or system change in "system" mode).

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

function hasDarkClass(): boolean {
  return (
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
  );
}

export function useChartTheme(): ChartTheme {
  const [dark, setDark] = useState(hasDarkClass);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const el = document.documentElement;
    const sync = () => setDark(el.classList.contains("dark"));
    sync();
    // Re-read whenever the <html> class changes (theme toggle / system flip).
    const obs = new MutationObserver(sync);
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark ? DARK : LIGHT;
}
