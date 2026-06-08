import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import { Landing } from './Landing';

describe('Landing', () => {
  it('composes hero, mech features, secondary grid and footer', () => {
    render(
      <I18nProvider lang="en">
        <Landing isAuthed={false} />
      </I18nProvider>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument(); // hero
    expect(screen.getByText('Real-time monitoring')).toBeInTheDocument(); // mech feature (fallback)
    expect(screen.getByText('Agent graph')).toBeInTheDocument(); // secondary grid
    expect(screen.getByText('Watch your fleet come alive.')).toBeInTheDocument(); // footer
  });
});
