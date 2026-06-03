# W4-A — Connector API routes (agent: connapi)

Scope (own ONLY these files):
- CREATE `v2/src/app/api/connectors/route.ts` (GET)
- CREATE `v2/src/app/api/connectors/[id]/[action]/route.ts` (POST)
- CREATE matching `*.test.ts` for both.

Code against LOCKED framework signatures from `@/lib/connectors`
(`list`, `connect`, `disconnect`, `testConnector`). Real bodies land from the
framework agent; stubs exist so tsc resolves.

## Endpoints

### GET /api/connectors
- `auth()` → if no `session.user` → 401 `{ error: "Unauthorized" }`.
- else → `{ connectors: await list(session.user.id) }`.

### POST /api/connectors/:id/:action
- `auth()` → 401 if none.
- `action`:
  - `"connect"` → parse body as a field map (`Record<string,string>`) → `connect(userId, id, fields)`.
  - `"disconnect"` → `disconnect(userId, id)`.
  - `"test"` → `testConnector(userId, id)`.
  - unknown → 400 `{ error: ... }`.
- Return the framework result verbatim (it is already secret-safe — masked).
- NEVER echo raw secrets: do not put the request body / fields back in the response.

## Conventions (matched from machines + conversations routes)
- `import { NextResponse } from "next/server"`, `import { auth } from "@/auth"`.
- Guard with `session?.user?.id` (conversations pattern).
- Dynamic params: `{ params }: { params: Promise<{ id: string; action: string }> }`, awaited.
- Body parse: `await req.json().catch(() => ({}))`.

## Tests (vitest, mock `@/auth` + `@/lib/connectors`)
- GET: 401 when unauthenticated; returns `{ connectors }` from mocked `list`.
- POST: 401 when unauthenticated.
- POST action routing: connect → `connect(userId,id,fields)`; disconnect → `disconnect`;
  test → `testConnector`; each called with correct args; returns framework result.
- POST unknown action → 400, no framework fn called.

## Success
`cd v2 && npx vitest run src/app/api/connectors` green. Do NOT run full test/build.
Do NOT commit.
