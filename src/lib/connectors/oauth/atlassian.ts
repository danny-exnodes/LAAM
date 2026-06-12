// Atlassian OAuth 2.0 (3LO) provider — Jira Cloud. Ground truth:
// .claude/tmp/connectors-research-2026-06-12.json (atlassian-oauth, official docs).
// Quirks vs Google:
//  - NO PKCE (confidential client only) — CSRF protection = state cookie alone.
//  - Token endpoint takes Content-Type: application/json (NOT form-encoded).
//  - Refresh tokens are ROTATING and SINGLE-USE (90-day inactivity expiry,
//    ~10-min reuse leeway): the framework persists the new refresh_token
//    immediately under a Postgres advisory lock (see ../index.ts + ./lock.ts).
//  - Tokens are only valid against https://api.atlassian.com/ex/jira/{cloudId};
//    enrich() resolves cloudId + site URL once via accessible-resources.
import {
  OAuthError,
  tokenFetch,
  redirectUri,
  type OAuthProvider,
  type OAuthTokens,
} from "./types";

const AUTH_ENDPOINT = "https://auth.atlassian.com/authorize";
const TOKEN_ENDPOINT = "https://auth.atlassian.com/oauth/token";
const RESOURCES_ENDPOINT = "https://api.atlassian.com/oauth/token/accessible-resources";
const ME_ENDPOINT = "https://api.atlassian.com/me";

// Visible creds-key contract: jira.ts imports these to read what enrich() wrote
// (a rename on either side becomes a compile error, not a runtime mystery).
export const ATLASSIAN_CREDS = { cloudId: "cloud_id", siteUrl: "site_url" } as const;

function clientEnv(): { id: string; secret: string } | null {
  const id = process.env.ATLASSIAN_OAUTH_CLIENT_ID;
  const secret = process.env.ATLASSIAN_OAUTH_CLIENT_SECRET;
  if (!id || !secret) return null;
  return { id, secret };
}

async function tokenRequest(payload: Record<string, string>): Promise<OAuthTokens> {
  const { ok, status, body } = await tokenFetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  const tok = body as (OAuthTokens & { error?: string; error_description?: string }) | null;
  if (!ok || !tok || !tok.access_token) {
    const err = (tok && (tok.error || tok.error_description)) || "HTTP " + status;
    throw new OAuthError("Atlassian token: " + err, tok?.error === "invalid_grant");
  }
  return tok;
}

export const atlassianProvider: OAuthProvider = {
  id: "atlassian",
  pkce: false, // not supported by auth.atlassian.com (verified 06-2026)

  configured() {
    return !!(clientEnv() && redirectUri("atlassian"));
  },

  authUrl({ scopes, state, redirectUri: cb }) {
    const env = clientEnv();
    if (!env) throw new OAuthError("Atlassian OAuth chưa được cấu hình (thiếu env)");
    const p = new URLSearchParams({
      audience: "api.atlassian.com",
      client_id: env.id,
      scope: scopes.join(" "),
      redirect_uri: cb,
      state,
      response_type: "code",
      prompt: "consent",
    });
    return AUTH_ENDPOINT + "?" + p.toString();
  },

  exchange({ code, redirectUri: cb }) {
    const env = clientEnv();
    if (!env) throw new OAuthError("Atlassian OAuth chưa được cấu hình (thiếu env)");
    return tokenRequest({
      grant_type: "authorization_code",
      client_id: env.id,
      client_secret: env.secret,
      code,
      redirect_uri: cb,
    });
  },

  refresh(refreshToken) {
    const env = clientEnv();
    if (!env) throw new OAuthError("Atlassian OAuth chưa được cấu hình (thiếu env)");
    return tokenRequest({
      grant_type: "refresh_token",
      client_id: env.id,
      client_secret: env.secret,
      refresh_token: refreshToken,
    });
  },

  // cloud_id + site_url are REQUIRED for any API call; the account label is
  // best-effort (needs the User Identity API + read:me — tolerate absence).
  async enrich(tok) {
    const bearer = { Authorization: "Bearer " + tok.access_token, Accept: "application/json" };
    const { ok, status, body } = await tokenFetch(RESOURCES_ENDPOINT, { headers: bearer });
    const sites = (Array.isArray(body) ? body : []) as { id?: string; url?: string }[];
    if (!ok || !sites[0]?.id) {
      throw new OAuthError("Atlassian accessible-resources: HTTP " + status);
    }
    // Multi-site grants exist (the user picks sites on the consent screen);
    // v1 binds the FIRST site — full multi-site selection is a follow-up.
    const out: Record<string, string> = {
      [ATLASSIAN_CREDS.cloudId]: String(sites[0].id),
      [ATLASSIAN_CREDS.siteUrl]: String(sites[0].url || ""),
    };
    try {
      const me = await tokenFetch(ME_ENDPOINT, { headers: bearer });
      const acc = me.body as { email?: string; name?: string } | null;
      if (me.ok && acc && (acc.email || acc.name)) out._account = String(acc.email || acc.name);
    } catch {
      /* display-only — never fail the connect over it */
    }
    return out;
  },
};
