'use client';

import styles from './landing.module.css';
import { useT } from '@/i18n/provider';
import { landing } from '@/i18n/dictionaries/landing';

// Universal tech tokens (not translated) — doubles as the #stack anchor target.
const STACK = ['Next.js 16', 'PostgreSQL', 'Auth.js', 'Drizzle', 'Ollama', 'Three.js'];

export function Footer() {
  const t = useT(landing);
  return (
    <footer id="stack" className={styles.footer}>
      <div className={styles.wrap}>
        <h2 className={styles.footerTitle}>{t('footer.title')}</h2>
        <p className={styles.footerSub}>{t('footer.sub')}</p>
        <a href="/register" className={styles.btnPrimary}>{t('footer.cta')}</a>
        <div className={styles.stackRow}>
          {STACK.map((s) => (
            <span key={s} className={styles.tag}>{s}</span>
          ))}
        </div>
        <p className={styles.footerNote}>{t('footer.note')}</p>
      </div>
    </footer>
  );
}
