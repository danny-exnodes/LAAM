'use client';

import { ShieldCheck, Lock, FileCheck2, Users } from 'lucide-react';
import styles from './landing.module.css';
import { useT } from '@/i18n/provider';
import { landing } from '@/i18n/dictionaries/landing';
import { FeatureCard } from './FeatureCard';
import type { GridFeature } from './features';

// Trust section (landing-eval cnt-5): local-first privacy pitch + a compact
// "by the numbers" strip. Values are universal facts, not live data — safe on
// a public page.
const BULLETS: GridFeature[] = [
  { id: 'sec-local', icon: ShieldCheck, keyPrefix: 'security.b1' },
  { id: 'sec-crypto', icon: Lock, keyPrefix: 'security.b2' },
  { id: 'sec-writes', icon: FileCheck2, keyPrefix: 'security.b3' },
  { id: 'sec-rbac', icon: Users, keyPrefix: 'security.b4' },
];

const STATS = [
  { labelKey: 'stats.cost', value: '$0' },
  { labelKey: 'stats.connectors', value: '6' },
  { labelKey: 'stats.langs', value: '3' },
  { labelKey: 'stats.roles', value: '4' },
  { labelKey: 'stats.agentchange', value: '0' },
] as const;

export function SecuritySection() {
  const t = useT(landing);
  return (
    <section id="security" className={styles.section}>
      <div className={styles.wrap}>
        <div className={styles.secHead}>
          <div className={styles.secK}>{t('security.k')}</div>
          <h2 className={styles.secTitle}>{t('security.title')}</h2>
        </div>
        <div className={styles.statsRow}>
          {STATS.map((s) => (
            <div key={s.labelKey} className={styles.stat}>
              <div className={styles.statK}>{t(s.labelKey)}</div>
              <div className={styles.statV}>{s.value}</div>
            </div>
          ))}
        </div>
        <div className={styles.grid4}>
          {BULLETS.map((b) => (
            <FeatureCard key={b.id} feature={b} t={t} />
          ))}
        </div>
      </div>
    </section>
  );
}
