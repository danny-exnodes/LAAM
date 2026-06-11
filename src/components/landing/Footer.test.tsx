import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import { Footer } from './Footer';

const ui = (authed: boolean) => (
  <I18nProvider lang="en">
    <Footer isAuthed={authed} />
  </I18nProvider>
);

describe('Footer', () => {
  it('shows the register CTA when logged out', () => {
    render(ui(false));
    const cta = screen.getByText('Get started');
    expect(cta).toHaveAttribute('href', '/register');
  });

  it('routes an authed user to the dashboard', () => {
    render(ui(true));
    const cta = screen.getByText('Go to dashboard');
    expect(cta).toHaveAttribute('href', '/dashboard');
    expect(screen.queryByText('Get started')).toBeNull();
  });
});
