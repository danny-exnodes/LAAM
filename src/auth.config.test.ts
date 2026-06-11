import { describe, it, expect, vi } from 'vitest';

// Mock the session-refresh helper so jwt-callback tests don't hit Postgres.
// This must be hoisted before the auth.config import.
vi.mock('@/lib/auth/session-refresh', () => ({
  refreshSessionFromDb: vi.fn(),
}));

import { refreshSessionFromDb } from '@/lib/auth/session-refresh';
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

// ------------------------------------------------------------------ jwt ----
// Invoke the jwt callback directly. On sign-in `user` is present; on refresh
// only `token` is present. The mocked refreshSessionFromDb lets us control DB
// responses without a real Postgres connection.

const jwtCb = authConfig.callbacks!.jwt!.bind(authConfig.callbacks) as (
  params: Record<string, unknown>
) => Promise<Record<string, unknown> | null>;

describe('jwt callback — per-request session re-validation', () => {
  it('sign-in path: sets token.role from user, no DB read', async () => {
    const token = { sub: 'u1' };
    const user = { role: 'admin' };
    const result = await jwtCb({ token, user } as never);
    expect(result).toMatchObject({ sub: 'u1', role: 'admin' });
    expect(refreshSessionFromDb).not.toHaveBeenCalled();
  });

  it('refresh path: active user → keeps token, refreshes role', async () => {
    vi.mocked(refreshSessionFromDb).mockResolvedValueOnce({ valid: true, role: 'owner' });
    const token = { sub: 'u1', role: 'member' };
    const result = await jwtCb({ token } as never);
    expect(result).toMatchObject({ sub: 'u1', role: 'owner' });
    expect(refreshSessionFromDb).toHaveBeenCalledWith('u1');
  });

  it('refresh path: disabled user → returns null (invalidates JWT cookie)', async () => {
    vi.mocked(refreshSessionFromDb).mockResolvedValueOnce({ valid: false });
    const token = { sub: 'u1', role: 'member' };
    const result = await jwtCb({ token } as never);
    expect(result).toBeNull();
  });

  it('refresh path: deleted user → returns null', async () => {
    vi.mocked(refreshSessionFromDb).mockResolvedValueOnce({ valid: false });
    const token = { sub: 'u99', role: 'member' };
    const result = await jwtCb({ token } as never);
    expect(result).toBeNull();
  });

  it('refresh path: DB error → fail-open, keeps existing role', async () => {
    // refreshSessionFromDb swallows the error and returns { valid: true, role: undefined }
    vi.mocked(refreshSessionFromDb).mockResolvedValueOnce({ valid: true, role: undefined });
    const token = { sub: 'u1', role: 'admin' };
    const result = await jwtCb({ token } as never);
    // Role must be preserved from the original token.
    expect(result).toMatchObject({ sub: 'u1', role: 'admin' });
  });

  it('refresh path: token with no sub → passes through untouched, no DB read', async () => {
    vi.mocked(refreshSessionFromDb).mockClear();
    const token = { role: 'member' }; // no sub
    const result = await jwtCb({ token } as never);
    expect(result).toEqual({ role: 'member' });
    expect(refreshSessionFromDb).not.toHaveBeenCalled();
  });
});
