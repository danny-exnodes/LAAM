import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it('renders the three language buttons', () => {
    render(ui(false));
    for (const code of ['vi', 'en', 'zh']) {
      expect(screen.getByRole('button', { name: code })).toBeInTheDocument();
    }
  });
});
