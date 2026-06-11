import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import { LandingNav } from './LandingNav';

const ui = (authed: boolean) => (
  <I18nProvider lang="en">
    <LandingNav isAuthed={authed} />
  </I18nProvider>
);

describe('LandingNav', () => {
  it('shows Get started + Sign in when logged out', () => {
    render(ui(false));
    expect(screen.getByText('Get started')).toBeInTheDocument();
    // "Sign in" appears in both the desktop nav and the always-in-DOM mobile menu
    expect(screen.getAllByText('Sign in').length).toBeGreaterThan(0);
    expect(screen.queryByText('Go to dashboard')).toBeNull();
  });

  it('shows Go to dashboard (and hides Get started) when logged in', () => {
    render(ui(true));
    expect(screen.getByText('Go to dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Get started')).toBeNull();
  });

  it('renders the three language buttons with full accessible names', () => {
    render(ui(false));
    // Label-in-Name (WCAG 2.5.3): name = native name + the visible 2-letter code.
    for (const name of ['Tiếng Việt (vi)', 'English (en)', '中文 (zh)']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('opens the mobile menu with section links and Sign in', () => {
    render(ui(false));
    const toggle = screen.getByRole('button', { name: 'Menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById('landing-menu')!.hidden).toBe(true);
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const menu = document.getElementById('landing-menu')!;
    expect(menu.querySelectorAll('a[href^="#"]')).toHaveLength(3);
    fireEvent.click(menu.querySelector('a[href="#features"]')!);
    expect(document.getElementById('landing-menu')!.hidden).toBe(true); // closes after choosing
  });
});
