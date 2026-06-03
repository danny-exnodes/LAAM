# V2 Wave 3 — Package W3-A (backend proxy endpoints) — Sub-plan

Owner: agent `proxies`. Parent plan: `2026-06-03-v2-wave3-chat.md` → "Package W3-A".

## Scope (own only these files)
- `v2/src/app/api/ollama/models/route.ts` (+ `.test.ts`)
- `v2/src/app/api/chat/info/route.ts` (+ `.test.ts`)
- `v2/src/app/api/fetch-url/route.ts` (+ `.test.ts`)
- `v2/src/app/api/geocode/route.ts` (+ `.test.ts`)
- `v2/src/app/api/reverse/route.ts` (+ `.test.ts`)
- `v2/src/app/api/route/route.ts` (+ `.test.ts`)
- `v2/src/app/api/nearby/route.ts` (+ `.test.ts`)

All `auth()`-guarded (401 if no session). Use `OLLAMA_URL` env (default `http://localhost:11434`).

## Conventions (matched from existing v2 routes/tests)
- `import { auth } from "@/auth"` → `const session = await auth(); if (!session?.user) return 401`.
- `NextResponse.json(body, { status })`.
- Tests use `vi.hoisted` + `vi.mock("@/auth", ...)`; mock `global.fetch` per-test; import handler after mocks.
- Strings stay Vietnamese to match v1 error messages.

## Decisions / deviations from v1 (surface, don't blend)
- v1's geocode/route/reverse/nearby use in-process **module caches + throttles** to respect Nominatim/OSRM/Overpass usage policy. In v2 each request is a serverless-style route invocation; a per-module Map cache still works within a warm process and is harmless. **Keep the cache + throttle** (ported) so we don't hammer the free services — same intent as v1.
- v1's `/api/ollama/models` proxies the LAAM logging proxy (`PROXY_URL/api/tags`). v2 talks to Ollama directly via `OLLAMA_URL/api/tags` (TL instruction). Return the raw `{ models: [...] }` shape; the dropdown wants names but parent ChatClient maps it — keep parity by returning the tags payload, normalized to `{ models: [] }` on bad shape (v1 behaviour). Per parent plan note "return model name list" — I'll return `{ models: string[] }` (names) to match the stated contract; this differs from v1's raw passthrough. **Flag for TL.**
  - RESOLUTION: parent plan line 57 says "return model name list". I'll return `{ models: string[] }` of names extracted from Ollama tags. Simpler for the client; documented here.
- `isPrivate`/`isBlockedHost`: ported verbatim as a **pure exported fn** so it's unit-testable. Name it `isBlockedHost` (v1 name) and export it.
- `htmlToText`: ported verbatim (pure, internal).

## TDD order (test first, then impl, per route)
1. **fetch-url** — pure `isBlockedHost` table test (blocks 127.0.0.1/10.x/192.168/169.254/172.16-31/localhost/.local/0.0.0.0/IPv6; allows example.com / 8.8.8.8). Route: 401 no-auth; 400 bad URL; 400 non-http(s); 403 blocked host; 200 returns extracted text (mock fetch).
2. **ollama/models** — 401 no-auth; 200 returns `{ models: names }` (mock fetch tags); 502 on fetch throw.
3. **chat/info** — 401 no-auth; 200 `{ model }`.
4. **geocode** — 401; 400 missing q; 404 not found; 200 `{lat,lng,display}`.
5. **reverse** — 401; 400 bad lat/lng; 404; 200 `{address,lat,lng}`.
6. **route** — 401; 400 <2 points; 200 `{geometry,distance,duration}`; 502 on no route.
7. **nearby** — 401; 400 bad lat/lng; 200 `{query,center,radius,results}`.

For routes with module caches, tests pass distinct inputs to avoid cache cross-talk, or mock fetch fresh each test.

## Success criteria
`cd v2 && npx vitest run src/app/api/ollama src/app/api/chat/info src/app/api/fetch-url src/app/api/geocode src/app/api/reverse src/app/api/route src/app/api/nearby` → all green.

## Hard constraints
- No package.json/vitest/tsconfig edits; no chat/route.ts; no components; no ocr route.
- Run ONLY my tests. No git add/commit/push.
