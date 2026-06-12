// Slack OAuth v2 provider. Ground truth: .claude/tmp/connectors-research-2026-06-12.json
// (slack-oauth, official docs). Quirks vs Google:
//  - Errors arrive as HTTP 200 with {ok:false, error} — branch on `ok`, not status.
//  - Bot tokens (xoxb) NEVER expire with rotation off (our setup mandates rotation
//    stays off — it is an irreversible switch to 12h tokens): no refresh() here,
//    so the framework's refresh chokepoint passes creds through untouched.
//    Revocation (app removed from workspace) surfaces at CALL time: the slack
//    connector's handlers throw OAuthError(invalidGrant=true) on
//    token_revoked/invalid_auth/account_inactive and the framework flips the
//    connector to needs_reconnect (spec 2026-06-12 §12.6).
//  - PKCE exists but is a permanent opt-in to public-client mode (30-day refresh
//    expiry) — deliberately NOT used; the state cookie covers CSRF.
//  - The xoxb token is per-WORKSPACE+app, not per-user: every LAAM user who
//    authorizes the same workspace gets the same bot identity (documented in help).
import {
  OAuthError,
  tokenFetch,
  redirectUri,
  type OAuthProvider,
  type OAuthTokens,
} from "./types";

const AUTH_ENDPOINT = "https://slack.com/oauth/v2/authorize";
const TOKEN_ENDPOINT = "https://slack.com/api/oauth.v2.access";

function clientEnv(): { id: string; secret: string } | null {
  const id = process.env.SLACK_CLIENT_ID;
  const secret = process.env.SLACK_CLIENT_SECRET;
  if (!id || !secret) return null;
  return { id, secret };
}

export const slackProvider: OAuthProvider = {
  id: "slack",
  pkce: false, // deliberate: enabling PKCE is an irreversible public-client switch

  configured() {
    return !!(clientEnv() && redirectUri("slack"));
  },

  authUrl({ scopes, state, redirectUri: cb }) {
    const env = clientEnv();
    if (!env) throw new OAuthError("Slack OAuth chưa được cấu hình (thiếu env)");
    const p = new URLSearchParams({
      client_id: env.id,
      scope: scopes.join(","), // Slack: comma-separated, not space
      state,
      redirect_uri: cb,
    });
    return AUTH_ENDPOINT + "?" + p.toString();
  },

  async exchange({ code, redirectUri: cb }) {
    const env = clientEnv();
    if (!env) throw new OAuthError("Slack OAuth chưa được cấu hình (thiếu env)");
    const basic = Buffer.from(env.id + ":" + env.secret).toString("base64");
    const { status, body } = await tokenFetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + basic, // recommended over body params
        Accept: "application/json",
      },
      body: new URLSearchParams({ code, redirect_uri: cb, grant_type: "authorization_code" }).toString(),
    });
    const data = body as
      | {
          ok?: boolean;
          error?: string;
          access_token?: string;
          scope?: string;
          bot_user_id?: string;
          team?: { id?: string; name?: string };
        }
      | null;
    if (!data || data.ok !== true || !data.access_token) {
      // HTTP-200-with-ok:false convention; only the short error code is safe to surface
      throw new OAuthError("Slack token: " + ((data && data.error) || "HTTP " + status));
    }
    const tok: OAuthTokens = {
      access_token: data.access_token,
      scope: data.scope,
      // no expires_in / refresh_token: rotation off → token never expires
      raw: { team_name: data.team?.name || "", bot_user_id: data.bot_user_id || "" },
    };
    return tok;
  },

  // no refresh(): xoxb tokens don't expire (rotation off)

  async enrich(tok) {
    const out: Record<string, string> = {};
    const team = tok.raw?.team_name;
    const bot = tok.raw?.bot_user_id;
    if (typeof team === "string" && team) out._account = team;
    if (typeof bot === "string" && bot) out.slack_bot_user_id = bot;
    return out;
  },
};
