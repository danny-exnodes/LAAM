"use client";

// Reads the app's class-based dark mode (`.dark` on <html>, set by the theme
// toggle / no-flash script) and re-renders on change. Mirrors the detection in
// useChartTheme but returns the raw boolean — used where a component just needs
// to pick a light/dark asset (e.g. CodeBlock's syntax-highlight theme).

import { useEffect, useState } from "react";

function hasDarkClass(): boolean {
  return (
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
  );
}

export function useIsDark(): boolean {
  const [dark, setDark] = useState(hasDarkClass);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const el = document.documentElement;
    const sync = () => setDark(el.classList.contains("dark"));
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}
