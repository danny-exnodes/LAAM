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

  it('allows /robots.txt without a session (must not 307 to /login)', () => {
    // Lighthouse flags robots.txt as invalid when it receives a redirect.
    // The metadata route at app/robots.ts only works if middleware lets it through.
    expect(can('/robots.txt', false)).toBe(true);
  });

  it('keeps token-authed endpoints reachable without a session', () => {
    // These routes do their own auth: collector machine-token (/api/ingest),
    // access_token bearer (/api/mcp), localhost/secret (/api/workflows/tick).
    // Gating them on a browser session would break every non-interactive caller.
    expect(can('/api/ingest', false)).toBe(true);
    expect(can('/api/mcp', false)).toBe(true);
    expect(can('/api/workflows/tick', false)).toBe(true);
  });

  it('keeps signup and the Auth.js API reachable without a session', () => {
    // Otherwise nobody could ever register or log in.
    expect(can('/api/register', false)).toBe(true);
    expect(can('/api/auth/callback/credentials', false)).toBe(true);
  });

  it('gates data APIs when logged out', () => {
    expect(can('/api/stats', false)).toBe(false);
    expect(can('/api/chat', false)).toBe(false);
  });

  it('matches public API paths exactly — sub-paths stay gated', () => {
    // The allowlist uses `===` (only /api/auth is prefix-matched). A switch to
    // startsWith would silently open everything nested under a public route.
    expect(can('/api/ingest/anything', false)).toBe(false);
    expect(can('/api/workflows', false)).toBe(false); // only /tick is public
  });
});
