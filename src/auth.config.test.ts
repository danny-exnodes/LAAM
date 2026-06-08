import { describe, it, expect } from 'vitest';
import { authConfig } from './auth.config';

// The `authorized` callback is the edge route-guard. The public landing page
// at `/` must be reachable when logged out, while app pages stay gated.
const can = (path: string, loggedIn: boolean): boolean =>
  authConfig.callbacks!.authorized!({
    auth: loggedIn ? ({ user: { id: '1' } } as never) : null,
    request: { nextUrl: { pathname: path } } as never,
  } as never) as boolean;

describe('route protection', () => {
  it('allows the landing page (/) when logged out', () => {
    expect(can('/', false)).toBe(true);
  });

  it('still gates the dashboard when logged out', () => {
    expect(can('/dashboard', false)).toBe(false);
  });

  it('keeps the auth pages public', () => {
    expect(can('/login', false)).toBe(true);
    expect(can('/register', false)).toBe(true);
  });

  it('allows gated pages when logged in', () => {
    expect(can('/dashboard', true)).toBe(true);
  });
});
