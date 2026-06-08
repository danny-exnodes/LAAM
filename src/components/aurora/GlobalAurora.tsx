'use client';

import { useRef } from 'react';
import { usePathname } from 'next/navigation';
import styles from './aurora.module.css';
import { useDotField } from '@/components/landing/useDotField';
import { useIsDark } from './useIsDark';

// The actual layers + dot field. Split out so it MOUNTS/UNMOUNTS as a unit when
// the gate flips — that way useDotField's effect runs against a real canvas on
// every activation (and its rAF is fully torn down when deactivated).
function AuroraLayers() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useDotField(canvasRef, { density: 0.55, alpha: 0.7, speed: 0.8 });
  return (
    <div className={styles.scene} aria-hidden="true">
      <div className={styles.base} />
      <div className={styles.key} />
      <canvas ref={canvasRef} className={styles.stars} />
      <div className={styles.vig} />
    </div>
  );
}

// App-wide background. Skips the landing ('/', which renders its own full-intensity
// Aurora) and only shows in dark mode (a dark ocean behind light-mode content would
// break the theme; light mode keeps its flat surfaces).
export function GlobalAurora() {
  const pathname = usePathname();
  const isDark = useIsDark();
  if (pathname === '/' || !isDark) return null;
  return <AuroraLayers />;
}
