'use client';

import { useEffect, useState } from 'react';

// Tracks the `.dark` class on <html> (set by the theme toggle / no-flash script)
// and reacts to runtime theme changes. SSR-safe: starts false, so the server and
// the first client render agree (null), then it syncs after mount.
export function useIsDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const update = () => setDark(el.classList.contains('dark'));
    update();
    const obs = new MutationObserver(update);
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}
