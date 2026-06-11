import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import { MechShowcase } from './MechShowcase';

afterEach(() => vi.unstubAllGlobals());

// jsdom has no WebGL, so this exercises the fallback path: the exploded 3D view
// is a progressive enhancement, and every feature must stay reachable as text.
describe('MechShowcase fallback (no WebGL)', () => {
  it('renders all six core feature panels as readable content', () => {
    render(
      <I18nProvider lang="en">
        <MechShowcase />
      </I18nProvider>,
    );
    const titles = [
      'Real-time monitoring',
      'Local AI chat · $0',
      'Connectors',
      'Workflow orchestration',
      'Multi-machine',
      'Dashboard & insights',
    ];
    for (const title of titles) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });
});

describe('MechShowcase viewport gate', () => {
  it('renders the readable grid below 1100px even when WebGL is available', () => {
    // matchMedia: no query matches → not reduced-motion, NOT wide enough
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList);
    // jsdom has no WebGL — fake it to prove the gate blocks because of viewport, not WebGL
    vi.stubGlobal('WebGLRenderingContext', class {});
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => ({})) as never;
    try {
      render(
        <I18nProvider lang="en">
          <MechShowcase />
        </I18nProvider>,
      );
      expect(screen.getByText('Real-time monitoring')).toBeInTheDocument();
      expect(screen.getByText('Dashboard & insights')).toBeInTheDocument();
      // The scroll-progress readout exists only in the exploded view — its
      // absence proves the narrow-viewport gate picked the readable grid.
      expect(screen.queryByText(/— \d+%/)).toBeNull();
    } finally {
      HTMLCanvasElement.prototype.getContext = orig;
    }
  });
});
