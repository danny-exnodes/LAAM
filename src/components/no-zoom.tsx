"use client";

// Lock zoom on phones for an app-like feel. The viewport meta (maximum-scale=1)
// is honored by Android but IGNORED by iOS Safari, so we also block iOS's pinch
// gesture* events here. Double-tap zoom is handled by `touch-action: manipulation`
// in globals.css. Renders nothing.
// The public landing (`/`) is exempt: marketing pages must stay zoomable
// (WCAG 1.4.4) — its page-level viewport export re-enables pinch zoom there.

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function NoZoom() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname === "/") return;
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
  }, [pathname]);
  return null;
}
