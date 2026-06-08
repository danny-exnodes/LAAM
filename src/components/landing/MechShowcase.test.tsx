import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import { MechShowcase } from './MechShowcase';

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
