'use client';

import styles from './landing.module.css';
import { useT } from '@/i18n/provider';
import { landing } from '@/i18n/dictionaries/landing';
import { GRID_FEATURES } from './features';
import { FeatureCard } from './FeatureCard';

export function FeatureGrid() {
  const t = useT(landing);
  return (
    <section id="more" className={styles.section}>
      <div className={styles.wrap}>
        <div className={styles.secHead}>
          <div className={styles.secK}>{t('grid.k')}</div>
          <h2 className={styles.secTitle}>{t('grid.title')}</h2>
        </div>
        <div className={styles.grid}>
          {GRID_FEATURES.map((f) => (
            <FeatureCard key={f.id} feature={f} t={t} />
          ))}
        </div>
      </div>
    </section>
  );
}
