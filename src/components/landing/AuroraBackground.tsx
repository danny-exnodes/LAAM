'use client';

import { useRef } from 'react';
import styles from './landing.module.css';
import { useDotField } from './useDotField';

// The persistent PS5-"Aurora" background — fixed, decorative, behind all content.
// CSS gradient base + corner key-light + light shaft + vignette, with the animated
// dot/particle canvas as its own layer. The mech's WebGL canvas (transparent)
// later renders ON TOP of this, so the dots show through everywhere.
export function AuroraBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useDotField(canvasRef);
  return (
    <div className={styles.scene} aria-hidden="true">
      <div className={styles.base} />
      <div className={styles.key} />
      <div className={styles.shaft} />
      <canvas ref={canvasRef} className={styles.stars} />
      <div className={styles.vig} />
    </div>
  );
}
