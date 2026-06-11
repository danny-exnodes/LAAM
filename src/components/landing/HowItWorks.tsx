'use client';

import styles from './landing.module.css';
import { useT } from '@/i18n/provider';
import { landing } from '@/i18n/dictionaries/landing';

const STEPS = ['s1', 's2', 's3'] as const;

// The REAL "how it works" section (the #how anchor used to point at the
// secondary feature grid — landing-eval ux-2/cnt-1). Three steps mirroring the
// actual pipeline: collector → sign-in/RBAC → live SSE dashboard.
export function HowItWorks() {
  const t = useT(landing);
  return (
    <section id="how" className={styles.section}>
      <div className={styles.wrap}>
        <div className={styles.secHead}>
          <div className={styles.secK}>{t('how.k')}</div>
          <h2 className={styles.secTitle}>{t('how.title')}</h2>
          <p className={styles.secSub}>{t('how.sub')}</p>
        </div>
        <ol className={styles.howGrid}>
          {STEPS.map((s, i) => (
            <li key={s} className={styles.howStep}>
              <span className={styles.howNum}>{i + 1}</span>
              <h3 className={styles.howTitle}>{t(`how.${s}.title`)}</h3>
              <p className={styles.howDesc}>{t(`how.${s}.desc`)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
