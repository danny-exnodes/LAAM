// Google OAuth provider — ported from the original google-oauth.ts (spec
// 2026-06-06), now behind the OAuthProvider contract (spec 2026-06-12 §2).
// Semantics preserved: PKCE S256, access_type=offline + prompt=consent (required
// to (re)obtain a refresh_token), and the External+Testing "7-day reality" —
// refresh tokens are revoked ~weekly, surfaced as OAuthError.invalidGrant so the
// UI offers a one-click "Reconnect".
import {
  OAuthError,
  tokenFetch,
  redirectUri,
  type OAuthProvider,
  type OAuthTokens,
} from "./types";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

function clientEnv(): { id: string; secret: string } | null {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!id || !secret) return null;
  return { id, secret };
}

// Best-effort: pull the account email from an id_token (JWT) WITHOUT verifying
// the signature — it came straight from Google's token endpoint over TLS and is
// used only for display ("connected as …").
export function parseIdTokenEmail(idToken?: string): string | null {
  if (!idToken) return null;
  const parts = idToken.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      email?: string;
    };
    return payload.email || null;
  } catch {
    return null;
  }
}

async function tokenRequest(body: URLSearchParams): Promise<OAuthTokens> {
  const { ok, status, body: data } = await tokenFetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: body.toString(),
  });
  const tok = data as (OAuthTokens & { error?: string; error_description?: string }) | null;
  if (!ok || !tok || !tok.access_token) {
    const err = (tok && (tok.error || tok.error_description)) || "HTTP " + status;
    throw new OAuthError("Google token: " + err, tok?.error === "invalid_grant");
  }
  return tok;
}

export const googleProvider: OAuthProvider = {
  id: "google",
  pkce: true,

  configured() {
    return !!(clientEnv() && redirectUri("google"));
  },

  authUrl({ scopes, state, codeChallenge, redirectUri: cb }) {
    const env = clientEnv();
    if (!env) throw new OAuthError("Google OAuth chưa được cấu hình (thiếu env)");
    const p = new URLSearchParams({
      client_id: env.id,
      redirect_uri: cb,
      response_type: "code",
      scope: scopes.join(" "),
      access_type: "offline", // ← get a refresh_token
      prompt: "consent", // ← force refresh_token even on re-consent
      include_granted_scopes: "true",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    return AUTH_ENDPOINT + "?" + p.toString();
  },

  exchange({ code, codeVerifier, redirectUri: cb }) {
    const env = clientEnv();
    if (!env) throw new OAuthError("Google OAuth chưa được cấu hình (thiếu env)");
    return tokenRequest(
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: codeVerifier,
        client_id: env.id,
        client_secret: env.secret,
        redirect_uri: cb,
      }),
    );
  },

  refresh(refreshToken) {
    const env = clientEnv();
    if (!env) throw new OAuthError("Google OAuth chưa được cấu hình (thiếu env)");
    return tokenRequest(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: env.id,
        client_secret: env.secret,
      }),
    );
  },

  // `google_email` kept alongside `_account` for back-compat with creds stored
  // before the multi-provider refactor (list() reads _account || google_email).
  async enrich(tok) {
    const out: Record<string, string> = {};
    const email = parseIdTokenEmail(tok.id_token);
    if (email) {
      out._account = email;
      out.google_email = email;
    }
    return out;
  },
};
