'use client';

import { useEffect, useState } from 'react';
import styles from './landing.module.css';
import { useT, useLang } from '@/i18n/provider';
import { landing } from '@/i18n/dictionaries/landing';
import { common } from '@/i18n/dictionaries/common';
import type { Lang } from '@/i18n/types';

const LANGS: Lang[] = ['vi', 'en', 'zh'];

// Sticky top nav. Plain <a> for routes (full-page nav into the app is fine for
// a marketing page and keeps it router-context-free for tests). Auth-aware CTA.
export function LandingNav({ isAuthed }: { isAuthed: boolean }) {
  const t = useT(landing);
  const tc = useT(common);
  const { lang, setLang } = useLang();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`${styles.nav} ${scrolled ? styles.navScrolled : ''}`}>
      <a href="#top" className={styles.brand}>
        <span className={styles.mark} aria-hidden="true" />
        LAAM
      </a>

      <nav className={styles.navLinks} aria-label="Sections">
        <a href="#features" className={styles.navLink}>{t('nav.features')}</a>
        <a href="#how" className={styles.navLink}>{t('nav.howItWorks')}</a>
        <a href="#stack" className={styles.navLink}>{t('nav.stack')}</a>
      </nav>

      <div className={styles.navRight}>
        <div className={styles.langGroup} role="group" aria-label={tc('lang.label')}>
          {LANGS.map((l) => (
            <button
              key={l}
              type="button"
              className={`${styles.langBtn} ${l === lang ? styles.langActive : ''}`}
              aria-pressed={l === lang}
              onClick={() => setLang(l)}
            >
              {l}
            </button>
          ))}
        </div>

        {isAuthed ? (
          <a href="/dashboard" className={styles.btnPrimary}>{t('nav.dashboard')}</a>
        ) : (
          <>
            <a href="/login" className={styles.btnGhost}>{t('nav.signin')}</a>
            <a href="/register" className={styles.btnPrimary}>{t('nav.getstarted')}</a>
          </>
        )}
      </div>
    </header>
  );
}
