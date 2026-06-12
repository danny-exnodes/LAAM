// Zalo OAuth v4 provider — Official Account (OA). Ground truth (confidence
// MEDIUM — official docs are a JS SPA; primary source = official zalo-php-sdk):
// .claude/tmp/connectors-research-2026-06-12.json (zalo-oa). Verify at runtime
// once the operator has a dev app. Quirks vs Google:
//  - App secret goes in an HTTP HEADER named `secret_key` (NOT in the body).
//  - PKCE: authorize takes `code_challenge` only (S256 implied, no
//    code_challenge_method param); code_verifier goes in the exchange body.
//  - access_token ~25h (TRUST the returned expires_in — sources disagree);
//    refresh_token lives 3 months and is SINGLE-USE (rotates every refresh) →
//    same advisory-lock + persist-immediately discipline as Atlassian.
//  - Consent is granted by an OA ADMIN for the WHOLE OA (one token represents
//    the OA, not the end user) — help text tells teams to designate one admin.
import {
  OAuthError,
  tokenFetch,
  redirectUri,
  type OAuthProvider,
  type OAuthTokens,
} from "./types";

const AUTH_ENDPOINT = "https://oauth.zaloapp.com/v4/oa/permission";
const TOKEN_ENDPOINT = "https://oauth.zaloapp.com/v4/oa/access_token";
const GETOA_ENDPOINT = "https://openapi.zalo.me/v2.0/oa/getoa";

function clientEnv(): { id: string; secret: string } | null {
  const id = process.env.ZALO_APP_ID;
  const secret = process.env.ZALO_APP_SECRET;
  if (!id || !secret) return null;
  return { id, secret };
}

async function tokenRequest(form: Record<string, string>, secret: string): Promise<OAuthTokens> {
  const { status, body } = await tokenFetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      secret_key: secret, // ← Zalo quirk: app secret as a header
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(form).toString(),
  });
  const data = body as
    | { access_token?: string; refresh_token?: string; expires_in?: number | string; error?: number | string; error_name?: string }
    | null;
  if (!data || !data.access_token) {
    const err = (data && (data.error_name || data.error)) ?? "HTTP " + status;
    // Zalo doesn't document a stable invalid_grant code AND signals errors with
    // HTTP 200 + an explicit `error` field. Dead grant = Zalo EXPLICITLY said so
    // (error/error_name present) on a non-5xx; a malformed/empty body (proxy
    // junk, outage) stays transient so we never flag needs_reconnect on a
    // hiccup (review 2026-06-12).
    const explicit = !!(data && (data.error !== undefined || data.error_name));
    throw new OAuthError("Zalo token: " + err, explicit && status < 500);
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    // expires_in arrives as a string in the wild — normalize; default 25h
    expires_in: Number(data.expires_in) || 90000,
  };
}

export const zaloProvider: OAuthProvider = {
  id: "zalo",
  pkce: true, // code_challenge only — authUrl below omits code_challenge_method

  configured() {
    return !!(clientEnv() && redirectUri("zalo"));
  },

  authUrl({ state, codeChallenge, redirectUri: cb }) {
    const env = clientEnv();
    if (!env) throw new OAuthError("Zalo OAuth chưa được cấu hình (thiếu env)");
    // No scope param exists — permissions come from the app↔OA link.
    const p = new URLSearchParams({
      app_id: env.id,
      redirect_uri: cb,
      code_challenge: codeChallenge,
      state,
    });
    return AUTH_ENDPOINT + "?" + p.toString();
  },

  exchange({ code, codeVerifier }) {
    const env = clientEnv();
    if (!env) throw new OAuthError("Zalo OAuth chưa được cấu hình (thiếu env)");
    return tokenRequest(
      { app_id: env.id, code, grant_type: "authorization_code", code_verifier: codeVerifier },
      env.secret,
    );
  },

  refresh(refreshToken) {
    const env = clientEnv();
    if (!env) throw new OAuthError("Zalo OAuth chưa được cấu hình (thiếu env)");
    return tokenRequest(
      { app_id: env.id, refresh_token: refreshToken, grant_type: "refresh_token" },
      env.secret,
    );
  },

  // Display-only OA name from getoa (works without a paid package). The oa_id in
  // the callback query is attacker-influenceable and unused → never persisted.
  async enrich(tok) {
    const out: Record<string, string> = {};
    try {
      const { ok, body } = await tokenFetch(GETOA_ENDPOINT, {
        headers: { access_token: tok.access_token, Accept: "application/json" },
      });
      const data = body as { error?: number; data?: { name?: string } } | null;
      if (ok && data && data.error === 0 && data.data?.name) {
        out._account = String(data.data.name);
      }
    } catch {
      /* display-only — never fail the connect over it */
    }
    return out;
  },
};
