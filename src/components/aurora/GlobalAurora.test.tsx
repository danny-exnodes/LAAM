import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

// usePathname needs the App Router; mock it (vi.hoisted so the hoisted vi.mock
// factory can reach the mutable path).
const h = vi.hoisted(() => ({ path: '/dashboard' }));
vi.mock('next/navigation', () => ({ usePathname: () => h.path }));

import { GlobalAurora } from './GlobalAurora';

describe('GlobalAurora gating', () => {
  beforeEach(() => {
    h.path = '/dashboard';
    document.documentElement.classList.remove('dark');
  });

  it('renders nothing in light mode', () => {
    const { container } = render(<GlobalAurora />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing on the landing route (/) even in dark mode', () => {
    document.documentElement.classList.add('dark');
    h.path = '/';
    const { container } = render(<GlobalAurora />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the decorative aurora on app routes in dark mode', () => {
    document.documentElement.classList.add('dark');
    h.path = '/dashboard';
    const { container } = render(<GlobalAurora />);
    expect(container.firstChild).not.toBeNull();
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('canvas')).toBeTruthy();
  });
});
