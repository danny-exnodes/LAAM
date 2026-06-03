# V2 Wave 4 — Package W4-C: 7 connector modules + registry

> **For agentic workers:** This is a sub-plan of `2026-06-03-v2-wave4-connectors.md` (Package W4-C). TDD, run only own tests.

**Goal:** Port v1's 7 connector modules (demo/github/trello/jira/google-drive/google-calendar/gmail) to typed `Connector` objects in `v2/src/lib/connectors/`, and fill `registry.ts` with the explicit array — keeping tool names + params IDENTICAL to v1.

**Architecture:** Each connector is a TS module default-exporting a `Connector` (per locked `types.ts`). Handlers typed `(args: Record<string,unknown>, creds: Record<string,string>) => Promise<unknown>`. Real API fetch with 12s `AbortController` timeout + `User-Agent: LAAM-connector/0.1`. `registry.ts` imports all 7 → `export const CONNECTORS: Connector[]`.

**Tech Stack:** TypeScript, native `fetch`, `node:buffer` (jira basic auth). Tests: vitest, `vi.spyOn(global,"fetch").mockResolvedValue(Response.json(...))`.

---

## Constraints (from TL)
- Do NOT edit `types.ts`, `index.ts`, `crypto.ts`, `store.ts`, package.json/tsconfig/vitest, api routes/components.
- Run ONLY: `cd v2 && npx vitest run src/lib/connectors/{github,trello,jira,google-drive,google-calendar,gmail,demo,registry}`.
- Do NOT commit.
- Tool names + params must match v1 exactly.

## Files
- Create: `v2/src/lib/connectors/{demo,github,trello,jira,google-drive,google-calendar,gmail}.ts`
- Create: `v2/src/lib/connectors/{demo,github,trello,jira,google-drive,google-calendar,gmail}.test.ts`
- Modify: `v2/src/lib/connectors/registry.ts` (fill array)
- Create: `v2/src/lib/connectors/registry.test.ts`

## Tool-name inventory (must match v1)
- demo: `demo_list_tasks`
- github: `github_list_repos`, `github_list_issues`, `github_search_issues`
- trello: `trello_list_boards`, `trello_list_cards`, `trello_create_card`
- jira: `jira_search_issues`, `jira_my_issues`
- google-drive: `gdrive_list_files`, `gdrive_search`
- google-calendar: `gcal_list_events`
- gmail: `gmail_list_messages`, `gmail_search`

---

### Task 1: demo connector (offline, no creds)
Port v1 `lib/connectors/demo.js`. Write test first: connector id `demo`, auth.type `none`, `demo_list_tasks` returns 4 tasks; with `{status:"done"}` filters to 1. Implement, run, done.

### Task 2: github connector
Port `github.js`. Test: id `github`, 3 tools with correct names; mock fetch → `github_list_repos` maps `full_name`→`name`; `github_list_issues` filters out PRs (`pull_request` present); `test()` returns ok with `@login`.

### Task 3: trello connector
Port `trello.js`. Test: id `trello`, 3 tools; mock fetch → `trello_list_boards` maps board; `trello_create_card` POSTs and shapes card.

### Task 4: jira connector
Port `jira.js` (Buffer basic auth, site normalization). Test: id `jira`, 2 tools; mock fetch → `jira_search_issues` shapes issue (key/summary/status/assignee/url); missing site throws.

### Task 5: google-drive connector
Port `google-drive.js`. Test: id `google-drive`, 2 tools; mock fetch → `gdrive_list_files` maps file; missing access_token throws.

### Task 6: google-calendar connector
Port `google-calendar.js`. Test: id `google-calendar`, 1 tool; mock fetch → `gcal_list_events` maps event (start/end/title).

### Task 7: gmail connector
Port `gmail.js`. Test: id `gmail`, 2 tools; mock fetch (list then per-message metadata) → `gmail_list_messages` returns expanded messages with subject/from.

### Task 8: registry
Fill `registry.ts`: import all 7, `export const CONNECTORS = [demo, github, trello, jira, gdrive, gcal, gmail]`. Test: 7 connectors, ids unique, every tool name unique across all connectors, every tool has a matching handler.

### Verify
`cd v2 && npx vitest run src/lib/connectors/{demo,github,trello,jira,google-drive,google-calendar,gmail,registry}` green.
