// OAuth provider contract — one module per provider (google/atlassian/slack/zalo),
// registered in ./registry. The connector framework (../index.ts) and the
// authorize/callback route are provider-agnostic: every provider-specific quirk
// (token endpoint encoding, PKCE support, refresh semantics, post-exchange
// enrichment) lives behind this interface.
//
// Trello is deliberately NOT a provider: its 1-click flow returns the token in a
// URL fragment with no code exchange (see ./trello.ts — an authorize accelerator
// that ends by writing ordinary token-mode creds).
//
// SECURITY RULE for implementations: error messages must carry only the parsed
// provider error code/description — never the request init, headers, or any
// client secret (errors can surface in logs and, for handlers, to the chat model).
import { createHash, randomBytes } from "crypto";

export type OAuthTokens = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number; // seconds; absent = token does not expire (slack)
  scope?: string;
  id_token?: string; // google: JWT carrying the account email
  // Provider-specific extras from the exchange response (e.g. slack team name)
  // for enrich() to consume. Never persisted as-is.
  raw?: Record<string, unknown>;
};

// invalidGrant=true means the grant is dead (revoked/expired/rotated-away) and
// the user must re-authorize — the framework flips the connector to
// `needs_reconnect`. Transient errors (network / 5xx) keep invalidGrant=false.
export class OAuthError extends Error {
  readonly invalidGrant: boolean;
  constructor(message: string, invalidGrant = false) {
    super(message);
    this.name = "OAuthError";
    this.invalidGrant = invalidGrant;
  }
}

export type OAuthProvider = {
  id: "google" | "atlassian" | "slack" | "zalo";
  // True when the operator configured this provider's env (client id/secret +
  // OAUTH_PUBLIC_BASE_URL). False degrades gracefully: the UI hides the
  // authorize button and shows the setup hint instead.
  configured(): boolean;
  // Providers without PKCE support (atlassian, slack) ignore codeChallenge.
  pkce: boolean;
  authUrl(o: { scopes: string[]; state: string; codeChallenge: string; redirectUri: string }): string;
  exchange(o: { code: string; codeVerifier: string; redirectUri: string }): Promise<OAuthTokens>;
  // Absent = access token never expires (slack with rotation off) — the refresh
  // chokepoint passes creds through untouched.
  refresh?(refreshToken: string): Promise<OAuthTokens>;
  // Post-exchange creds enrichment (atlassian: cloud_id/site_url; google: email
  // from id_token; slack: team name). Keys land in the encrypted creds blob.
  // `_account` is the display name shown as "connected as X".
  enrich?(tok: OAuthTokens): Promise<Record<string, string>>;
};

// The per-provider callback the operator registers in each console:
// {OAUTH_PUBLIC_BASE_URL}/api/connectors/{providerId}/callback
export function redirectUri(providerId: string): string | null {
  const base = process.env.OAUTH_PUBLIC_BASE_URL;
  if (!base) return null;
  return base.replace(/\/+$/, "") + "/api/connectors/" + providerId + "/callback";
}

const base64url = (b: Buffer): string => b.toString("base64url");

// PKCE S256 pair. The verifier stays in the encrypted state cookie; the
// challenge goes to the provider.
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function randomState(): string {
  return base64url(randomBytes(16));
}

// Shared 12s-timeout fetch for token endpoints. Returns the parsed JSON body
// (or null) + status; callers decide what is an error for their provider.
export async function tokenFetch(
  url: string,
  init: RequestInit,
): Promise<{ status: number; ok: boolean; body: Record<string, unknown> | null }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    const body = (await r.json().catch(() => null)) as Record<string, unknown> | null;
    return { status: r.status, ok: r.ok, body };
  } finally {
    clearTimeout(timer);
  }
}
