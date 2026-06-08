'use client';

import styles from './landing.module.css';
import { useT } from '@/i18n/provider';
import { landing } from '@/i18n/dictionaries/landing';

export function Hero() {
  const t = useT(landing);
  return (
    <section id="top" className={styles.hero}>
      <span className={`${styles.eyebrow} ${styles.heroEyebrow}`}>{t('hero.eyebrow')}</span>
      <h1 className={styles.h1}>
        {t('hero.title')}
        <br />
        <span className={styles.accent}>{t('hero.titleAccent')}</span>
      </h1>
      <p className={styles.heroSub}>{t('hero.sub')}</p>
      <div className={styles.heroCtas}>
        <a href="/register" className={styles.btnPrimary}>{t('hero.ctaPrimary')}</a>
        <a href="/login" className={styles.btnGhost}>{t('hero.ctaSecondary')}</a>
      </div>
      <div className={styles.scrollcue} aria-hidden="true">
        <span className={styles.scrollBar} />
        {t('hero.scroll')}
      </div>
    </section>
  );
}
