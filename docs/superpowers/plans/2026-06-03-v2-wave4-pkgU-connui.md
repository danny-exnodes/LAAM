# Wave 4 Package U — /connectors page + i18n (agent: connui)

Port v1 `public/connectors.js` UI behaviour to v2 (Next.js client component), consuming
GET /api/connectors (`{ connectors: ConnectorListItem[] }`) and the POST
`/api/connectors/:id/:action` (connect/disconnect/test) routes owned by `connapi`.

## Scope (own only)
- CREATE `v2/src/app/connectors/page.tsx` — thin auth shell: `auth()` guard → redirect /login,
  `<AppHeader current="/connectors" role=… />` + `<ConnectorsClient/>`. `export const dynamic = "force-dynamic"`.
- CREATE `v2/src/components/connectors/ConnectorsClient.tsx` (+ `ConnectorCard.tsx` sub-component).
- CREATE matching `*.test.tsx`.
- ADD `/connectors` link to `app-header.tsx` NAV (minimal, additive).
- i18n: dict `dictionaries/connectors.ts` already has ALL 17 conn.* keys → NO new keys needed.

## Design (matches v1 behaviour)
ConnectorsClient (client):
1. `fetch('/api/connectors')` on mount → `{connectors}` → state list; on failure show `conn.loadErr`.
2. Render heading + sub (i18n) + grid of ConnectorCard.
3. ConnectorCard per item:
   - head: icon glyph + name + blurb + connected/notConnected badge.
   - tools line: `conn.toolsLabel: a, b, c` when tools present.
   - body by auth.type:
     - `token` → one input per `auth.fields` (secret → type=password); placeholder = masked hint if `set` else field placeholder. help text if present.
     - `oauth` → setup help text; Connect button disabled (oauthNeeded).
     - `none` → help text; Enable button.
   - note line (inline ok/err feedback), hidden until action.
   - actions: connected → Test + Disconnect; not connected → Connect/Enable.
4. connect(id, fields): collect non-empty inputs → POST :id/connect {fields} → on ok test(reload) else err note.
   disconnect(id): POST :id/disconnect → reload list.
   test(id): POST :id/test → ok→info/testOk green; err→error/testErr red.
5. Reload list after connect-then-test and after disconnect (re-fetch).

Icon: v2 has no icon library. Render the connector `icon` string inside a styled badge
(uppercase first letter / short glyph). Keep it simple — a rounded square with the first
char; the v1 lucide lookup is not available in v2 and out of scope.

## Tests (RTL, vitest, wrap in `<I18nProvider lang="vi">`)
- mocks `globalThis.fetch` (vi.fn) returning `{connectors:[…]}` → renders names/blurbs/badges/tool list.
- connect: fill field inputs, click Connect → fetch called with `/api/connectors/<id>/connect`, POST,
  body JSON contains the field values. (mock connect ok + test ok)
- disconnect: click Disconnect on a connected card → fetch `/api/connectors/<id>/disconnect` POST.
- test: click Test → fetch `/api/connectors/<id>/test` POST; ok info shown inline.
- load error: fetch rejects/!ok → conn.loadErr shown.

Run ONLY: `cd v2 && npx vitest run src/components/connectors`.

## Constraints
No edits to package.json/vitest/tsconfig, lib/connectors/*, api routes, api/chat.
No git add/commit. Leave uncommitted.
