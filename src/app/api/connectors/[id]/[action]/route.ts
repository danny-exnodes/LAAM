import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import {
  connect,
  disconnect,
  testConnector,
  isOAuthConnector,
  oauthScopes,
  saveGoogleTokens,
} from "@/lib/connectors";
import {
  googleOAuthConfig,
  buildAuthUrl,
  exchangeCode,
  randomState,
  pkcePair,
  parseIdTokenEmail,
} from "@/lib/connectors/google-oauth";
import { encryptJson, decryptJson } from "@/lib/connectors/crypto";
import { requireMutator } from "@/lib/auth/rbac";

const OAUTH_COOKIE = "laam_oauth";
const OAUTH_TTL_MS = 600_000; // 10 minutes

type OAuthState = { state: string; codeVerifier: string; connectorId: string; exp: number };

// Build an absolute app URL for redirects. Prefer the configured public base
// (canonical behind Tailscale/proxy); fall back to the request origin.
function appUrl(path: string, reqUrl: string): URL {
  const base = process.env.OAUTH_PUBLIC_BASE_URL?.replace(/\/+$/, "") || new URL(reqUrl).origin;
  return new URL(path, base);
}

// POST /api/connectors/:id/:action — connect / disconnect / test a connector
// for the logged-in user. The framework results are already secret-safe; we
// never echo the submitted credential fields back to the browser.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // viewer is read-only — connect/disconnect/test all touch live credentials.
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
    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}

// GET /api/connectors/:id/authorize  → start the Google OAuth redirect flow.
// GET /api/connectors/google/callback → finish it (connectorId carried in state cookie).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(appUrl("/login", req.url));
  }
  const userId = session.user.id;
  const { id, action } = await params;

  if (action === "authorize") return authorize(req, id);
  if (action === "callback") return callback(req, userId);
  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}

async function authorize(req: Request, connectorId: string): Promise<NextResponse> {
  if (!isOAuthConnector(connectorId)) {
    return NextResponse.json({ error: "connector này không dùng OAuth" }, { status: 400 });
  }
  if (!googleOAuthConfig()) {
    return NextResponse.redirect(appUrl("/connectors?error=oauth_not_configured", req.url));
  }
  const state = randomState();
  const { verifier, challenge } = pkcePair();
  const url = buildAuthUrl({ scopes: oauthScopes(connectorId), state, codeChallenge: challenge });

  const payload: OAuthState = { state, codeVerifier: verifier, connectorId, exp: Date.now() + OAUTH_TTL_MS };
  const res = NextResponse.redirect(url);
  res.cookies.set(OAUTH_COOKIE, encryptJson(payload), {
    httpOnly: true,
    secure: true,
    sameSite: "lax", // sent on the top-level GET navigation back from Google
    path: "/api/connectors",
    maxAge: OAUTH_TTL_MS / 1000,
  });
  return res;
}

async function callback(req: Request, userId: string): Promise<NextResponse> {
  const url = new URL(req.url);
  const fail = (reason: string) => {
    const res = NextResponse.redirect(appUrl(`/connectors?error=${reason}`, req.url));
    res.cookies.delete(OAUTH_COOKIE);
    return res;
  };

  if (url.searchParams.get("error")) return fail("oauth_denied");

  const raw = (await cookies()).get(OAUTH_COOKIE)?.value;
  if (!raw) return fail("oauth_state");
  let st: OAuthState;
  try {
    st = decryptJson<OAuthState>(raw);
  } catch {
    return fail("oauth_state");
  }
  if (st.exp < Date.now()) return fail("oauth_expired");

  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  if (!code || stateParam !== st.state) return fail("oauth_state"); // CSRF / missing code

  try {
    const tok = await exchangeCode({ code, codeVerifier: st.codeVerifier });
    await saveGoogleTokens(userId, st.connectorId, tok, parseIdTokenEmail(tok.id_token));
  } catch {
    return fail("oauth_exchange");
  }

  const res = NextResponse.redirect(appUrl(`/connectors?connected=${encodeURIComponent(st.connectorId)}`, req.url));
  res.cookies.delete(OAUTH_COOKIE);
  return res;
}
