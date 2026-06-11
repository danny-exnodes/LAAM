import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import { SecuritySection } from './SecuritySection';

describe('SecuritySection', () => {
  it('renders the four trust bullets and the stats strip', () => {
    render(
      <I18nProvider lang="en">
        <SecuritySection />
      </I18nProvider>,
    );
    for (const title of ['Local-first', 'Encrypted at rest', 'Gated writes', 'Four-role RBAC']) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    expect(screen.getByText('$0')).toBeInTheDocument(); // model-cost stat
    expect(screen.getByText('Agent changes')).toBeInTheDocument(); // the "0 changes" differentiator
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(4);
  });
});
