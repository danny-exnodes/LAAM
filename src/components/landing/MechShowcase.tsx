'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import styles from './landing.module.css';
import { useT } from '@/i18n/provider';
import { landing } from '@/i18n/dictionaries/landing';
import { CORE_FEATURES, type PartId } from './features';
import { HudPanel } from './HudPanel';
import { useScrollProgress } from './useScrollProgress';

// The 3D canvas is client-only (WebGL) and Three.js is heavy — load it lazily so
// it never enters the hero bundle, and only when the section is near.
const Mech3D = dynamic(() => import('./Mech3D'), { ssr: false });

const PLACE: Record<PartId, string> = {
  head: styles.coHead,
  core: styles.coCore,
  armL: styles.coArmL,
  armR: styles.coArmR,
  legL: styles.coLegL,
  legR: styles.coLegR,
};

function supportsWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const c = document.createElement('canvas');
    return !!(
      typeof WebGLRenderingContext !== 'undefined' &&
      (c.getContext('webgl') || c.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

export function MechShowcase() {
  const t = useT(landing);
  const sectionRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const { progressRef, progress } = useScrollProgress(sectionRef);
  const [active, setActive] = useState(false);
  const [enable3D, setEnable3D] = useState(false);

  // Decide 3D vs static fallback after mount (needs browser APIs). The exploded
  // view is desktop-only: below 1100px the absolute HUD placements collide
  // (landing-eval ux-1/rsp-1/a11y-1), so narrow viewports get the same readable
  // grid as no-WebGL / reduced-motion.
  useEffect(() => {
    if (typeof matchMedia !== 'function') {
      setEnable3D(supportsWebGL());
      return;
    }
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    const wide = matchMedia('(min-width: 1100px)');
    const decide = () => setEnable3D(!reduce.matches && wide.matches && supportsWebGL());
    decide();
    wide.addEventListener('change', decide);
    reduce.addEventListener('change', decide);
    return () => {
      wide.removeEventListener('change', decide);
      reduce.removeEventListener('change', decide);
    };
  }, []);

  // Mouse parallax for the mech.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      pointerRef.current.x = e.clientX / window.innerWidth - 0.5;
      pointerRef.current.y = e.clientY / window.innerHeight - 0.5;
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  // Only run the render loop while the section is near the viewport.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setActive(e.isIntersecting), { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [enable3D]);

  const Heading = (
    <div className={styles.secHead}>
      <div className={styles.secK}>{t('mech.k')}</div>
      <h2 className={styles.secTitle}>{t('mech.title')}</h2>
      <p className={styles.secSub}>{t('mech.sub')}</p>
    </div>
  );

  // FALLBACK — no WebGL or reduced motion: every feature is a normal, readable
  // panel (the exploded 3D view is a progressive enhancement, never the only path).
  if (!enable3D) {
    return (
      <section id="features" className={styles.section}>
        <div className={styles.wrap}>
          {Heading}
          <div className={styles.fallbackGrid}>
            {CORE_FEATURES.map((f) => (
              <HudPanel key={f.id} feature={f} t={t} />
            ))}
          </div>
        </div>
      </section>
    );
  }

  // FULL — pinned exploded view.
  return (
    <section id="features">
      <div className={styles.section}>
        <div className={styles.wrap}>{Heading}</div>
      </div>
      <div ref={sectionRef} className={styles.explode}>
        <div className={styles.sticky}>
          <div className={styles.stageWrap}>
            {active && <Mech3D progressRef={progressRef} pointerRef={pointerRef} active={active} />}
          </div>
          {CORE_FEATURES.map((f) => {
            const shown = progress >= f.revealAt;
            return (
              <div key={f.id} className={`${PLACE[f.part]} ${shown ? styles.coShown : styles.coHidden}`}>
                <HudPanel feature={f} t={t} />
              </div>
            );
          })}
          <div className={styles.prog}>{`${t('mech.k')} — ${Math.round(progress * 100)}%`}</div>
        </div>
      </div>
    </section>
  );
}
