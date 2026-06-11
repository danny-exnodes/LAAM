import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import { HowItWorks } from './HowItWorks';

describe('HowItWorks', () => {
  it('renders three steps under the #how anchor', () => {
    render(
      <I18nProvider lang="en">
        <HowItWorks />
      </I18nProvider>,
    );
    expect(document.getElementById('how')).not.toBeNull();
    expect(screen.getByText('Install the collector')).toBeInTheDocument();
    expect(screen.getByText('Sign in')).toBeInTheDocument();
    expect(screen.getByText('Watch live')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3);
  });
});
