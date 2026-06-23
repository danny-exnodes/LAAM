# Checkpoint: connectors (Wave 4 W4-C) — 2026-06-03

## What was done
- Ported all 7 v1 connector modules to typed `Connector` objects (per locked `types.ts`) in `v2/src/lib/connectors/`.
- Filled `registry.ts`: `export const CONNECTORS: Connector[] = [demo, github, trello, jira, gdrive, gcal, gmail]`.
- Tool names + params kept IDENTICAL to v1 (parity verified by registry test asserting the full 14-name inventory).
- Each connector: real fetch + 12s AbortController timeout + `User-Agent: LAAM-connector/0.1`; handlers typed `(args: Record<string,unknown>, creds: Record<string,string>) => Promise<unknown>`.

## Files created
- `v2/src/lib/connectors/{demo,github,trello,jira,google-drive,google-calendar,gmail}.ts` (+ matching `*.test.ts`)
- `v2/src/lib/connectors/registry.test.ts`
- Modified: `v2/src/lib/connectors/registry.ts` (filled array)
- Plan: `docs/superpowers/plans/2026-06-03-v2-wave4-pkgC-connectors.md`

## Current state
- `npx vitest run src/lib/connectors/{demo,github,trello,jira,google-drive,google-calendar,gmail,registry}` → 8 files, 31 tests pass.
- `tsc --noEmit` clean for all my connector files (other agents' in-flight files not my concern).
- NOT committed (per instructions — left for TL review).

## Deviations from v1 (intentional, minor)
- jira/gdrive/gcal/gmail error paths: v1 fell back to `body.error` (an object) in the thrown message; under TS I coerce to a string ("error"/JSON). Behavior (throw on non-ok) preserved; only the human-readable text differs in edge cases.
- Added `User-Agent` header to jira (v1 jira lacked it) — TL plan requires UA header on all; harmless.
- Demo `demo_list_tasks` narrows `args.status` to string before filtering (was loose in v1).

## Next steps
- TL integration: full `npm test` + `npm run build` after framework agent (W4-F) lands real `index.ts` (it imports `CONNECTORS` from my registry).

## Blockers / Risks
- None. registry imports are static; framework `index.ts` consumes `CONNECTORS` — tsc resolves once F's impl lands.
