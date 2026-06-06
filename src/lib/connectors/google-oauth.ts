// Shared Google OAuth helper for the calendar/drive/gmail connectors.
// In-app authorization-code flow with PKCE. The 3 Google connectors only declare
// their scopes; this module owns the consent URL, token exchange, and refresh.
//
// Account context = personal Gmail → External app in "Testing": refresh tokens are
// revoked after ~7 days. We never pretend they're permanent — `refreshAccessToken`
// surfaces `invalid_grant` as GoogleAuthError.invalidGrant so the UI can show a
// one-click "Reconnect". `access_type=offline` + `prompt=consent` are REQUIRED to
// receive a refresh_token (and to re-receive it on re-consent).
import { createHash, randomBytes } from "crypto";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CALLBACK_PATH = "/api/connectors/google/callback";

export type GoogleTokens = {
  access_token: string;
  refresh_token?: string;
  expires_in: number; // seconds
  scope?: string;
  id_token?: string; // present when openid/email scope requested
};

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export class GoogleAuthError extends Error {
  readonly invalidGrant: boolean;
  constructor(message: string, invalidGrant = false) {
    super(message);
    this.name = "GoogleAuthError";
    this.invalidGrant = invalidGrant;
  }
}

const base64url = (b: Buffer): string => b.toString("base64url");

// Read OAuth config from env. Returns null when not configured (operator hasn't
// set up the Google app yet) so callers can show a helpful "not configured" note
// instead of crashing.
export function googleOAuthConfig(): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const base = process.env.OAUTH_PUBLIC_BASE_URL;
  if (!clientId || !clientSecret || !base) return null;
  return { clientId, clientSecret, redirectUri: base.replace(/\/+$/, "") + CALLBACK_PATH };
}

// PKCE S256 pair. verifier is the secret kept in the (encrypted) cookie; challenge
// is sent to Google.
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function randomState(): string {
  return base64url(randomBytes(16));
}

// Best-effort: pull the account email from an id_token (JWT) WITHOUT verifying the
// signature — the token came straight from Google's token endpoint over TLS and is
// used only for display ("connected as …"). Returns null if absent/malformed.
export function parseIdTokenEmail(idToken?: string): string | null {
  if (!idToken) return null;
  const parts = idToken.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { email?: string };
    return payload.email || null;
  } catch {
    return null;
  }
}

export function buildAuthUrl(opts: { scopes: string[]; state: string; codeChallenge: string }): string {
  const cfg = googleOAuthConfig();
  if (!cfg) throw new GoogleAuthError("Google OAuth chưa được cấu hình (thiếu env)");
  const p = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: opts.scopes.join(" "),
    access_type: "offline", // ← get a refresh_token
    prompt: "consent", // ← force refresh_token even on re-consent
    include_granted_scopes: "true",
    state: opts.state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
  });
  return AUTH_ENDPOINT + "?" + p.toString();
}

async function tokenRequest(body: URLSearchParams): Promise<GoogleTokens> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  let r: Response;
  try {
    r = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: body.toString(),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const data = (await r.json().catch(() => null)) as
    | (GoogleTokens & { error?: string; error_description?: string })
    | null;
  if (!r.ok || !data || !data.access_token) {
    const err = (data && (data.error || data.error_description)) || "HTTP " + r.status;
    throw new GoogleAuthError("Google token: " + err, data?.error === "invalid_grant");
  }
  return data;
}

export function exchangeCode(opts: { code: string; codeVerifier: string }): Promise<GoogleTokens> {
  const cfg = googleOAuthConfig();
  if (!cfg) throw new GoogleAuthError("Google OAuth chưa được cấu hình (thiếu env)");
  return tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code: opts.code,
      code_verifier: opts.codeVerifier,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
    }),
  );
}

export function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const cfg = googleOAuthConfig();
  if (!cfg) throw new GoogleAuthError("Google OAuth chưa được cấu hình (thiếu env)");
  return tokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    }),
  );
}
