// Trello authorize ACCELERATOR — deliberately NOT an OAuthProvider (spec
// 2026-06-12 §12.4): Trello has no OAuth2 code exchange; its 1-click client flow
// returns the user token in the URL FRAGMENT, which never reaches the server.
// The whole token-acquisition step lives in this one module so it can be
// replaced wholesale when Trello's OAuth2 (RFC-89) ships:
//   authorize → trello.com/1/authorize (return_url = our /connectors/trello/callback
//   PAGE, callback_method=fragment) → capture page JS reads #token=…, scrubs the
//   hash, POSTs it to /api/connectors/trello/capture → server VERIFIES the token
//   against /1/members/me before persisting ordinary token-mode creds {key, token}.
// The operator API key is public-ish (the per-user token is the real secret) and
// the LAAM origin MUST be registered under the Power-Up's Allowed Origins —
// otherwise Trello blocks the redirect AFTER consent.
const AUTH_ENDPOINT = "https://trello.com/1/authorize";
const API = "https://api.trello.com/1";

// The capture PAGE path (a Next.js page, not an API route — fragments are
// client-side only). Origin must be in the Power-Up's Allowed Origins.
export const TRELLO_CALLBACK_PATH = "/connectors/trello/callback";

export function trelloApiKey(): string | null {
  return process.env.TRELLO_API_KEY || null;
}

// NEVER fall back to the request origin: Tailscale terminates TLS at the proxy,
// so a request-derived origin can mismatch the registered Allowed Origin and
// kill the flow AFTER the user consents (spec §12.4).
export function trelloAuthorizeConfigured(): boolean {
  return !!(trelloApiKey() && process.env.OAUTH_PUBLIC_BASE_URL);
}

export function trelloAuthorizeUrl(): string | null {
  const key = trelloApiKey();
  const base = process.env.OAUTH_PUBLIC_BASE_URL;
  if (!key || !base) return null;
  const p = new URLSearchParams({
    expiration: "never", // accepted risk §12.15: revocable; bounded expiry = monthly manual reconnect
    scope: "read,write",
    response_type: "token",
    callback_method: "fragment",
    key,
    return_url: base.replace(/\/+$/, "") + TRELLO_CALLBACK_PATH,
  });
  return AUTH_ENDPOINT + "?" + p.toString();
}

// Verify a captured token before persisting (fail-closed against token
// injection: the POST is session-bound, but the token itself must prove it
// belongs to a real Trello account reachable with OUR operator key).
export async function trelloVerifyToken(
  token: string,
): Promise<{ ok: boolean; username?: string; error?: string }> {
  const key = trelloApiKey();
  if (!key) return { ok: false, error: "TRELLO_API_KEY chưa cấu hình" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(API + "/members/me?fields=username", {
      headers: {
        Accept: "application/json",
        Authorization: `OAuth oauth_consumer_key="${key}", oauth_token="${token}"`,
      },
      signal: ctrl.signal,
    });
    if (!r.ok) return { ok: false, error: "token không hợp lệ (HTTP " + r.status + ")" };
    const me = (await r.json().catch(() => null)) as { username?: string } | null;
    return { ok: true, username: me?.username };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}
