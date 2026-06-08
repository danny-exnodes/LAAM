'use client';

import type { CSSProperties } from 'react';
import styles from './landing.module.css';
import type { CoreFeature } from './features';
import type { Translator } from '@/i18n/types';

// Sci-fi HUD feature panel (no corner reticle brackets, per design feedback):
// angular clip-path frame, MOD header, faux feature screenshot, telemetry row,
// description, mono tags, conic gauge. Pure presentation — `t` is passed in.
export function HudPanel({ feature, t }: { feature: CoreFeature; t: Translator }) {
  const Icon = feature.icon;
  return (
    <div className={styles.hudFrame}>
      <div className={styles.hud}>
        <div className={styles.ticks} aria-hidden="true" />

        <div className={styles.hudHead}>
          <span className={styles.modid}>{feature.modId}</span>
          <span className={styles.status}>
            <span className={styles.statusDot} aria-hidden="true" />
            {feature.status}
          </span>
        </div>

        <div className={styles.hudTitle}>
          <span className={styles.hudNum}>{feature.num}</span>
          <h3>{t(`${feature.keyPrefix}.title`)}</h3>
        </div>

        <div className={styles.shot} aria-hidden="true">
          <div className={styles.shotTop}>
            <span className={styles.shotDot} />
            <span className={styles.shotDot} />
            <span className={styles.shotDot} />
            <span className={styles.shotPath}>laam // {feature.id}</span>
          </div>
          <div className={styles.scanline} />
          <div className={styles.shotGrid} />
          <div className={styles.shotIco}>
            <Icon size={40} strokeWidth={1.4} />
          </div>
        </div>

        <div className={styles.telem}>
          {feature.telemetry.map((tel) => (
            <div key={tel.labelKey} className={styles.stat}>
              <div className={styles.statK}>{t(tel.labelKey)}</div>
              <div className={styles.statV}>{tel.value}</div>
            </div>
          ))}
        </div>

        <p className={styles.desc}>{t(`${feature.keyPrefix}.desc`)}</p>

        <div className={styles.foot}>
          {feature.tags.map((tag) => (
            <span key={tag} className={styles.tag}>{tag}</span>
          ))}
          <div className={styles.gaugeWrap}>
            <div className={styles.gauge} style={{ '--g': feature.gauge.value } as CSSProperties} />
            <span className={styles.gaugeLabel}>{feature.gauge.label}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
