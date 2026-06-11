'use client';

import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import styles from './landing.module.css';
import { useT, useLang } from '@/i18n/provider';
import { landing } from '@/i18n/dictionaries/landing';
import { common } from '@/i18n/dictionaries/common';
import type { Lang } from '@/i18n/types';

const LANGS: Lang[] = ['vi', 'en', 'zh'];
// Accessible names for the 2-letter language buttons (a11y-5) — proper names,
// not translated.
const LANG_NAMES: Record<Lang, string> = { vi: 'Tiếng Việt', en: 'English', zh: '中文' };

// Sticky top nav. Plain <a> for routes (full-page nav into the app is fine for
// a marketing page and keeps it router-context-free for tests). Auth-aware CTA.
// ≤768px the inline section links collapse into a hamburger menu (project
// convention: responsive-conventions.md).
export function LandingNav({ isAuthed }: { isAuthed: boolean }) {
  const t = useT(landing);
  const tc = useT(common);
  const { lang, setLang } = useLang();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`${styles.nav} ${scrolled || open ? styles.navScrolled : ''}`}>
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
              // Label-in-Name (WCAG 2.5.3): the visible 2-letter code must be part
              // of the accessible name — "中文" alone doesn't contain "zh".
              aria-label={`${LANG_NAMES[l]} (${l})`}
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

        <button
          type="button"
          className={styles.menuBtn}
          aria-expanded={open}
          aria-controls="landing-menu"
          aria-label={t('nav.menu')}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </button>
      </div>

      <div id="landing-menu" className={styles.mobileMenu} hidden={!open}>
        <a href="#features" className={styles.mobileLink} onClick={() => setOpen(false)}>{t('nav.features')}</a>
        <a href="#how" className={styles.mobileLink} onClick={() => setOpen(false)}>{t('nav.howItWorks')}</a>
        <a href="#stack" className={styles.mobileLink} onClick={() => setOpen(false)}>{t('nav.stack')}</a>
        {!isAuthed && (
          <a href="/login" className={styles.mobileLink} onClick={() => setOpen(false)}>{t('nav.signin')}</a>
        )}
      </div>
    </header>
  );
}
