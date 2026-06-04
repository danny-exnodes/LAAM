"use client";

// Lock zoom on phones for an app-like feel. The viewport meta (maximum-scale=1)
// is honored by Android but IGNORED by iOS Safari, so we also block iOS's pinch
// gesture* events here. Double-tap zoom is handled by `touch-action: manipulation`
// in globals.css. Renders nothing.

import { useEffect } from "react";

export function NoZoom() {
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    const opts = { passive: false } as const;
    document.addEventListener("gesturestart", prevent, opts);
    document.addEventListener("gesturechange", prevent, opts);
    document.addEventListener("gestureend", prevent, opts);
    return () => {
      document.removeEventListener("gesturestart", prevent);
      document.removeEventListener("gesturechange", prevent);
      document.removeEventListener("gestureend", prevent);
    };
  }, []);
  return null;
}
