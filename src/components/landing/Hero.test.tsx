import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import { Hero } from './Hero';

describe('Hero', () => {
  it('renders the headline and both CTAs', () => {
    render(
      <I18nProvider lang="en">
        <Hero />
      </I18nProvider>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Get started')).toBeInTheDocument();
    expect(screen.getByText('Sign in')).toBeInTheDocument();
  });
});
