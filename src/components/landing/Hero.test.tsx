import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import { Hero } from './Hero';

const ui = (authed: boolean) => (
  <I18nProvider lang="en">
    <Hero isAuthed={authed} />
  </I18nProvider>
);

describe('Hero', () => {
  it('renders the headline and both CTAs when logged out', () => {
    render(ui(false));
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Get started')).toHaveAttribute('href', '/register');
    expect(screen.getByText('Sign in')).toHaveAttribute('href', '/login');
  });

  it('routes an authed user straight to the dashboard', () => {
    render(ui(true));
    const cta = screen.getByText('Go to dashboard');
    expect(cta).toHaveAttribute('href', '/dashboard');
    expect(screen.queryByText('Get started')).toBeNull();
    expect(screen.queryByText('Sign in')).toBeNull();
  });
});
