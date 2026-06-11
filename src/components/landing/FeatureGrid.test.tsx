import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import { FeatureGrid } from './FeatureGrid';

describe('FeatureGrid', () => {
  it('renders every secondary feature title', () => {
    render(
      <I18nProvider lang="en">
        <FeatureGrid />
      </I18nProvider>,
    );
    for (const title of [
      'Agent graph',
      'Auth & RBAC',
      'Local-first · $0',
      'Audit log',
      'Three languages',
      'World tools',
      'Full-text search',
      'Maps & geo tools',
    ]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });
});
