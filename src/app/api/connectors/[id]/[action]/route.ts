import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import {
  connect,
  disconnect,
  testConnector,
  isOAuthConnector,
  oauthScopes,
  oauthProviderOf,
  saveOAuthTokens,
  saveTrelloToken,
} from "@/lib/connectors";
import { PROVIDERS } from "@/lib/connectors/oauth/registry";
import { redirectUri, pkcePair, randomState } from "@/lib/connectors/oauth/types";
import {
  trelloApiKey,
  trelloAuthorizeUrl,
  trelloVerifyToken,
} from "@/lib/connectors/oauth/trello";
import { encryptJson, decryptJson } from "@/lib/connectors/crypto";
import { requireMutator } from "@/lib/auth/rbac";

// Per-connector state cookie (laam_oauth_<connectorId>): two concurrent flows
// in one browser (e.g. gmail + jira) must not clobber each other's
// state/PKCE-verifier — each callback consumes only its own entry, matched by
// the state param (spec 2026-06-12 §12.8).
const OAUTH_COOKIE_PREFIX = "laam_oauth_";
const OAUTH_TTL_MS = 600_000; // 10 minutes

type OAuthState = { state: string; codeVerifier: string; connectorId: string; exp: number };

// Build an absolute app URL for redirects. Prefer the configured public base
// (canonical behind Tailscale/proxy); fall back to the request origin.
// NOTE: authorize/callback redirect URIs sent to providers NEVER use this
// fallback — they come from redirectUri()/trelloAuthorizeUrl() (env-only).
function appUrl(path: string, reqUrl: string): URL {
  const base = process.env.OAUTH_PUBLIC_BASE_URL?.replace(/\/+$/, "") || new URL(reqUrl).origin;
  return new URL(path, base);
}

function stateCookieName(connectorId: string): string {
  // connector ids are [a-z0-9-]; keep the cookie name safe regardless
  return OAUTH_COOKIE_PREFIX + connectorId.replace(/[^a-zA-Z0-9_-]/g, "");
}

function setStateCookie(res: NextResponse, payload: OAuthState): void {
  res.cookies.set(stateCookieName(payload.connectorId), encryptJson(payload), {
    httpOnly: true,
    secure: true,
    sameSite: "lax", // sent on the top-level GET navigation back from the provider
    path: "/api/connectors",
    maxAge: OAUTH_TTL_MS / 1000,
  });
}

// POST /api/connectors/:id/:action — connect / disconnect / test / capture for
// the logged-in user. The framework results are already secret-safe; we never
// echo the submitted credential fields back to the browser.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // viewer is read-only — connect/disconnect/test/capture all touch live credentials.
  const gate = requireMutator(session);
  if (gate instanceof Response) return gate;
  const userId = session.user.id;
  const { id, action } = await params;

  switch (action) {
    case "connect": {
      const body = (await req.json().catch(() => ({}))) as {
        fields?: Record<string, string>;
      };
      return NextResponse.json(await connect(userId, id, body.fields ?? {}));
    }
    case "disconnect":
      return NextResponse.json(await disconnect(userId, id));
    case "test":
      return NextResponse.json(await testConnector(userId, id));
    case "capture": {
      if (id !== "trello") return NextResponse.json({ error: "capture chỉ dành cho trello" }, { status: 400 });
      return trelloCapture(req, userId);
    }
    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}

// GET /api/connectors/:id/authorize    → start the provider redirect flow
//     (:id = connector, e.g. jira / gmail / trello).
// GET /api/connectors/:id/callback     → finish it (:id = PROVIDER, e.g. google /
//     atlassian / slack / zalo — each registered in that provider's console;
//     the destination connectorId travels in the encrypted state cookie).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(appUrl("/login", req.url));
  }
  // viewer is read-only — the OAuth flow saves live credentials, so it must be
  // gated too (the POST gate alone is bypassable via this GET). Redirect style
  // (this handler returns redirects, not JSON) so a viewer lands on a page.
  if (session.user.role === "viewer") {
    return NextResponse.redirect(appUrl("/connectors?error=forbidden", req.url));
  }
  const userId = session.user.id;
  const { id, action } = await params;

  if (action === "authorize") return authorize(req, id);
  if (action === "callback") return callback(req, userId, id);
  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}

async function authorize(req: Request, connectorId: string): Promise<NextResponse> {
  // Trello accelerator: not OAuth — the consent page returns the token in the
  // URL fragment to our capture PAGE (oauth/trello.ts).
  if (connectorId === "trello") {
    const url = trelloAuthorizeUrl();
    if (!url) return NextResponse.redirect(appUrl("/connectors?error=oauth_not_configured", req.url));
    const state = randomState();
    const res = NextResponse.redirect(url);
    setStateCookie(res, { state, codeVerifier: "", connectorId: "trello", exp: Date.now() + OAUTH_TTL_MS });
    return res;
  }

  if (!isOAuthConnector(connectorId)) {
    return NextResponse.json({ error: "connector này không dùng OAuth" }, { status: 400 });
  }
  const providerId = oauthProviderOf(connectorId) ?? "";
  const provider = PROVIDERS[providerId];
  const cb = redirectUri(providerId);
  if (!provider?.configured() || !cb) {
    return NextResponse.redirect(appUrl("/connectors?error=oauth_not_configured", req.url));
  }
  const state = randomState();
  const { verifier, challenge } = pkcePair();
  const url = provider.authUrl({
    scopes: oauthScopes(connectorId),
    state,
    codeChallenge: provider.pkce ? challenge : "",
    redirectUri: cb,
  });

  const res = NextResponse.redirect(url);
  setStateCookie(res, {
    state,
    codeVerifier: provider.pkce ? verifier : "",
    connectorId,
    exp: Date.now() + OAUTH_TTL_MS,
  });
  return res;
}

// Scan laam_oauth_* cookies for the entry matching this callback's state param.
// Returns the parsed state + its cookie name so the caller deletes exactly it.
async function findStateCookie(
  stateParam: string | null,
): Promise<{ st: OAuthState; cookieName: string } | null> {
  if (!stateParam) return null;
  const all = (await cookies()).getAll();
  for (const c of all) {
    if (!c.name.startsWith(OAUTH_COOKIE_PREFIX)) continue;
    try {
      const st = decryptJson<OAuthState>(c.value);
      if (st.state === stateParam) return { st, cookieName: c.name };
    } catch {
      /* not ours / stale — keep scanning */
    }
  }
  return null;
}

async function callback(req: Request, userId: string, providerId: string): Promise<NextResponse> {
  const url = new URL(req.url);
  const provider = PROVIDERS[providerId];
  const fail = (reason: string, cookieName?: string) => {
    const res = NextResponse.redirect(appUrl(`/connectors?error=${reason}`, req.url));
    if (cookieName) res.cookies.delete(cookieName);
    return res;
  };

  if (!provider) return fail("oauth_state");
  if (url.searchParams.get("error")) return fail("oauth_denied");

  const found = await findStateCookie(url.searchParams.get("state"));
  if (!found) return fail("oauth_state"); // CSRF / missing or mismatched state
  const { st, cookieName } = found;
  if (st.exp < Date.now()) return fail("oauth_expired", cookieName);

  // Fail-closed provider/connector agreement (spec §12.8): the cookie's
  // connector must actually use the provider named in the callback URL — never
  // rely on the provider's token endpoint to reject a cross-provider code.
  if (oauthProviderOf(st.connectorId) !== providerId) return fail("oauth_state", cookieName);

  const code = url.searchParams.get("code");
  if (!code) return fail("oauth_state", cookieName);

  const cb = redirectUri(providerId);
  if (!cb) return fail("oauth_not_configured", cookieName);

  try {
    const tok = await provider.exchange({ code, codeVerifier: st.codeVerifier, redirectUri: cb });
    await saveOAuthTokens(userId, st.connectorId, providerId, tok);
  } catch {
    return fail("oauth_exchange", cookieName);
  }

  const res = NextResponse.redirect(
    appUrl(`/connectors?connected=${encodeURIComponent(st.connectorId)}`, req.url),
  );
  res.cookies.delete(cookieName);
  return res;
}

// POST /api/connectors/trello/capture — the capture page extracted #token=…
// client-side. Three defenses against token injection (spec §4): the POST is
// session-bound + mutator-gated (above), the flow-proof cookie must exist and
// be fresh, and the token is verified live against /1/members/me before persist.
async function trelloCapture(req: Request, userId: string): Promise<NextResponse> {
  const cookieName = stateCookieName("trello");
  const raw = (await cookies()).get(cookieName)?.value;
  const fail = (status: number, error: string) => {
    const res = NextResponse.json({ ok: false, error }, { status });
    res.cookies.delete(cookieName);
    return res;
  };
  if (!raw) return fail(400, "phiên authorize không tồn tại — bấm lại nút Kết nối");
  let st: OAuthState;
  try {
    st = decryptJson<OAuthState>(raw);
  } catch {
    return fail(400, "phiên authorize không hợp lệ");
  }
  if (st.connectorId !== "trello" || st.exp < Date.now()) {
    return fail(400, "phiên authorize đã hết hạn — bấm lại nút Kết nối");
  }
  const body = (await req.json().catch(() => ({}))) as { token?: string };
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) return fail(400, "thiếu token");
  const key = trelloApiKey();
  if (!key) return fail(400, "TRELLO_API_KEY chưa cấu hình");

  const verified = await trelloVerifyToken(token);
  if (!verified.ok) return fail(400, verified.error || "token không hợp lệ");

  await saveTrelloToken(userId, token, key);
  const res = NextResponse.json({ ok: true, username: verified.username || null });
  res.cookies.delete(cookieName);
  return res;
}
