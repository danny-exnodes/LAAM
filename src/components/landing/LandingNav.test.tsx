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
    expect(screen.getByText('Sign in')).toBeInTheDocument();
    expect(screen.queryByText('Go to dashboard')).toBeNull();
  });

  it('shows Go to dashboard (and hides Get started) when logged in', () => {
    render(ui(true));
    expect(screen.getByText('Go to dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Get started')).toBeNull();
  });

  it('renders the three language buttons with full accessible names', () => {
    render(ui(false));
    for (const name of ['Tiếng Việt', 'English', '中文']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('opens the mobile menu with section links and Sign in', () => {
    render(ui(false));
    const toggle = screen.getByRole('button', { name: 'Menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const menu = document.getElementById('landing-menu')!;
    expect(menu.querySelectorAll('a[href^="#"]')).toHaveLength(3);
    fireEvent.click(menu.querySelector('a[href="#features"]')!);
    expect(document.getElementById('landing-menu')).toBeNull(); // closes after choosing
  });
});
