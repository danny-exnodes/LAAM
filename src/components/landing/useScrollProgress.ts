'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

// Tracks how far a pinned section has been scrolled through (0→1).
// - `progressRef` updates every frame (read by the 3D mech without re-rendering).
// - `progress` is quantized (0.02 steps) state, so React only re-renders ~50×
//   over the whole scroll instead of every frame — used for HUD panel reveal.
export function useScrollProgress(sectionRef: RefObject<HTMLElement | null>) {
  const progressRef = useRef(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let ticking = false;
    let lastQ = -1;
    const compute = () => {
      const el = sectionRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      const p = Math.min(1, Math.max(0, -r.top / (total || 1)));
      progressRef.current = p;
      const q = Math.round(p * 50) / 50;
      if (q !== lastQ) {
        lastQ = q;
        setProgress(q);
      }
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        compute();
        ticking = false;
      });
    };
    compute();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [sectionRef]);

  return { progressRef, progress };
}
