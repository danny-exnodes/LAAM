'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './landing.module.css';
import type { GridFeature } from './features';
import type { Translator } from '@/i18n/types';

// A "depth card" that rises out of 3D depth when it scrolls into view.
// Without IntersectionObserver (jsdom) it renders shown, so content is always
// reachable; reduced-motion also forces the shown state via CSS.
export function FeatureCard({ feature, t }: { feature: GridFeature; t: Translator }) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const Icon = feature.icon;

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`${styles.fcard} ${inView ? styles.fcardIn : ''}`}>
      <div className={styles.ico} aria-hidden="true">
        <Icon size={26} strokeWidth={1.5} />
      </div>
      <h3 className={styles.fcardTitle}>{t(`${feature.keyPrefix}.title`)}</h3>
      <p className={styles.fcardDesc}>{t(`${feature.keyPrefix}.desc`)}</p>
    </div>
  );
}
