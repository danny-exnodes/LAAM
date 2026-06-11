import { describe, it, expect } from 'vitest';
import { landing } from './landing';

// Mirrors the other dictionary tests: the landing page ships in all three
// languages (project i18n convention), so every key MUST carry vi/en/zh.
describe('landing dictionary', () => {
  it('has a non-empty vi/en/zh for every key', () => {
    for (const [key, entry] of Object.entries(landing)) {
      expect(entry.vi, `${key}.vi`).toBeTruthy();
      expect(entry.en, `${key}.en`).toBeTruthy();
      expect(entry.zh, `${key}.zh`).toBeTruthy();
    }
  });

  it('covers the six core feature titles + descriptions', () => {
    for (let i = 1; i <= 6; i++) {
      expect(landing[`feat.${i}.title`], `feat.${i}.title`).toBeDefined();
      expect(landing[`feat.${i}.desc`], `feat.${i}.desc`).toBeDefined();
    }
  });

  it('covers hero, mech-section, footer and the two primary CTAs', () => {
    for (const k of ['hero.title', 'hero.ctaPrimary', 'hero.ctaSecondary', 'mech.title', 'footer.title', 'footer.cta']) {
      expect(landing[k], k).toBeDefined();
    }
  });

  it('covers how-it-works, security and the new grid cards', () => {
    for (let i = 1; i <= 3; i++) {
      expect(landing[`how.s${i}.title`], `how.s${i}.title`).toBeDefined();
      expect(landing[`how.s${i}.desc`], `how.s${i}.desc`).toBeDefined();
    }
    for (let i = 1; i <= 4; i++) {
      expect(landing[`security.b${i}.title`], `security.b${i}.title`).toBeDefined();
      expect(landing[`security.b${i}.desc`], `security.b${i}.desc`).toBeDefined();
    }
    for (const k of ['how.k', 'how.title', 'how.sub', 'security.k', 'security.title',
      'grid.search.title', 'grid.search.desc', 'grid.map.title', 'grid.map.desc', 'hud.demo']) {
      expect(landing[k], k).toBeDefined();
    }
  });
});
