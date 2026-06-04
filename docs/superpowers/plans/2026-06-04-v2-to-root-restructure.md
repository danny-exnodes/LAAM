# v2→root Restructure + v1 Archive — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline, sequential — this is stateful git surgery; do NOT parallelize). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Archive v1 to a recoverable branch, then promote the entire `v2/` Next.js app to the repo root so the root IS the v2 app — without losing v1 and without breaking v2.

**Architecture:** Preserve v1 forever on branch `archive/v1` (still runnable at :4317 from there) + in git history. Do all destructive work on branch `chore/v2-to-root`. Move tracked files with `git mv` (history-preserving); resolve 6 root↔v2 collisions (v2 wins, `.gitignore` merges); rewrite v1-centric docs (CLAUDE.md/README/CHANGELOG) for v2; sweep `v2/` paths in living Serena memories; verify with `npm ci && npm run build && npm test` from the new root.

**Tech Stack:** git, Next.js 16, npm, Vitest, PowerShell (Windows host).

---

## Decisions baked in (object during review if wrong)
- **proxy/** → archived in `archive/v1`, **removed from root** (handoff §2: droppable for v2; restore from archive if external-Ollama monitoring is ever needed — noted in `backlog/v1-unported.md`).
- **scripts/qwen-chat.sh**, **.claude/** → **kept at root** (generic tooling, not v1 app code).
- **test/run.mjs** (v1 node test runner) → removed (v2 uses Vitest under `src/`).
- **archive/v1 pushed to origin** (preserve v1 remotely, not just locally).
- **Integration** → land on a branch + open PR (not direct-to-main) so the restructure is reviewable.
- v1 Docker stack (`docker-compose.yml`, `docker-compose.macos.yml`, `Dockerfile`, `.dockerignore`) → removed from root (in archive); v2 keeps only its Postgres `docker-compose.yml`.

## Inventory (measured 2026-06-04)
- **Move v2→root:** `src/ drizzle/ collector/ vitest.setup.ts vitest.config.ts tsconfig.json postcss.config.mjs next.config.ts drizzle.config.ts package.json package-lock.json docker-compose.yml README.md .env.example .gitignore` + untracked `v2/setup-poc.ps1` + untracked `v2/.env` (real secrets) + nuke `v2/node_modules` `v2/.next`.
- **Remove (v1, archived):** `public/ lib/ bin/ proxy/ test/ Dockerfile .dockerignore docker-compose.yml docker-compose.macos.yml package.json package-lock.json README.md .env.example .gitignore`.
- **Keep as-is:** `.serena/ docs/ .claude/ scripts/ AGENTS.md CHANGELOG.md`.
- **Rewrite:** `CLAUDE.md` (v1→v2), `README.md` (promote v2's + project intro), `CHANGELOG.md` (add entry).
- **6 collisions** (root & v2 same name): `.env.example .gitignore README.md docker-compose.yml package.json package-lock.json`.

---

## Task 0: Baseline + branches (safety net first)

**Files:** none (git + state capture)

- [ ] **Step 1: Confirm clean intent + capture v2 test baseline**

Run (from repo root):
```powershell
cd D:\Projects\personal_projects\LAAM\v2
npm ci
npm test 2>&1 | Select-String -Pattern "Test Files|Tests" | Select-Object -Last 2
cd ..
```
Expected: a line like `Tests  XXX passed (XXX)`. **Record XXX** — this is the post-move target.

- [ ] **Step 2: Commit current Serena/docs WIP on main**

These are this session's knowledge-store updates (decision, backlog, checkpoint, INDEX, plan, setup script). Commit so they're a clean baseline (setup-poc.ps1 is committed in v2/ now; it git-moves in Task 3).
```powershell
git add .serena/ docs/ v2/setup-poc.ps1
git commit -m @'
docs(serena): POC model decision + v1-unported backlog + restructure plan

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```
Expected: commit created; `git status` shows only ignored/untracked env+node_modules.

- [ ] **Step 3: Create + push archive branch (v1 preserved forever)**

```powershell
git branch archive/v1
git push -u origin archive/v1
```
Expected: `archive/v1` on origin. From this branch v1 is fully intact and runnable (`npm install && npm start` → :4317).

- [ ] **Step 4: Create + switch to working branch**

```powershell
git switch -c chore/v2-to-root
```
Expected: `On branch chore/v2-to-root`.

---

## Task 1: Remove v1 root files (colliding + v1-only)

**Files:** `git rm` v1 tree at root.

- [ ] **Step 1: Remove the 6 colliding v1 files**

```powershell
git rm package.json package-lock.json README.md docker-compose.yml .env.example .gitignore
```
Expected: 6 deletions staged. (Destinations now free for the v2 versions.)

- [ ] **Step 2: Remove v1-only code + infra (already in archive/v1)**

```powershell
git rm -r public lib bin proxy test Dockerfile .dockerignore docker-compose.macos.yml
```
Expected: all staged as deletions. Keep dirs `.serena docs .claude scripts` + `AGENTS.md CHANGELOG.md` untouched (CLAUDE.md rewritten later).

- [ ] **Step 3: Verify only intended deletions**

Run: `git status --short`
Expected: `D` lines only for v1 paths above; nothing under `.serena/ docs/ .claude/ scripts/`.

---

## Task 2: Move v2 → root (history-preserving)

**Files:** `git mv` each v2 top-level entry to root.

- [ ] **Step 1: Move tracked v2 entries to root**

```powershell
git mv v2/src src
git mv v2/drizzle drizzle
git mv v2/collector collector
git mv v2/vitest.setup.ts vitest.setup.ts
git mv v2/vitest.config.ts vitest.config.ts
git mv v2/tsconfig.json tsconfig.json
git mv v2/postcss.config.mjs postcss.config.mjs
git mv v2/next.config.ts next.config.ts
git mv v2/drizzle.config.ts drizzle.config.ts
git mv v2/package.json package.json
git mv v2/package-lock.json package-lock.json
git mv v2/docker-compose.yml docker-compose.yml
git mv v2/README.md README.md
git mv v2/.env.example .env.example
git rm v2/.gitignore
```
Expected: renames staged; `v2/.gitignore` deleted (root .gitignore rebuilt in Task 3).

- [ ] **Step 2: Move untracked files (real .env secrets + setup script)**

```powershell
if (Test-Path v2\.env) { Move-Item v2\.env .env }
Move-Item v2\setup-poc.ps1 setup-poc.ps1
```
Expected: `.env` (your AUTH_SECRET/CONNECTOR_KEY/DEFAULT_CHAT_MODEL) + `setup-poc.ps1` now at root.

- [ ] **Step 3: Nuke leftover untracked v2/ (node_modules, .next) and the empty dir**

```powershell
git ls-files v2        # expect: EMPTY (all tracked files moved)
Remove-Item -Recurse -Force v2
```
Expected: `git ls-files v2` prints nothing; `v2/` no longer exists.

---

## Task 3: Rebuild root .gitignore (merge v1 + v2)

**Files:** Create `.gitignore` (root).

- [ ] **Step 1: Write merged .gitignore**

Create `.gitignore`:
```gitignore
# deps & build
node_modules/
.next/
out/
next-env.d.ts
*.tsbuildinfo

# env / secrets (never commit real values — keep .env.example)
.env
.env.local
.env*.local
.env.*
!.env.example

# user-entered connector credentials / local data — NEVER commit
connectors.json
.laam/

# logs & os
*.log
.DS_Store

# screenshot / test proof artifacts
*-proof/
```

- [ ] **Step 2: Stage it**

Run: `git add .gitignore`
Expected: staged. `git status` shows `.env` + `node_modules/` NOT tracked (ignored).

---

## Task 4: Fix path-dependent file (setup-poc.ps1)

**Files:** Modify `setup-poc.ps1` (root) — it assumed it lived in `v2/`.

- [ ] **Step 1: Update the final instructions block**

In `setup-poc.ps1`, the closing here-string says `cd "$V2"; npm run start`. Since `$V2 = $PSScriptRoot` is now the repo root (the app), the run command is just `npm run start`. Replace the line:
```
    cd `"$V2`"; npm run start         # http://localhost:3000
```
with:
```
    npm run start                     # http://localhost:3000 (chạy tại root)
```
(The `Push-Location $V2` / docker / `.env` / `npm ci` / migrate / build logic stays correct — `$V2` = root = the app.)

- [ ] **Step 2: Confirm no other `v2/` path assumptions in moved configs**

Run: `Select-String -Path next.config.ts,tsconfig.json,drizzle.config.ts,package.json,vitest.config.ts -Pattern "v2/" `
Expected: **no matches** (all use relative paths). If any match, fix to drop the `v2/` prefix.

---

## Task 5: Verify the moved app builds & tests from root (CRITICAL)

**Files:** none (verification gate — this proves the move didn't break v2).

- [ ] **Step 1: Fresh install at root**

Run: `npm ci`
Expected: installs from the moved `package-lock.json`, no path errors.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: `✓ Compiled successfully` + route list (`/`, `/dashboard`, `/agents`, `/chat`, `/connectors`, `/graph`, `/machines`, api routes). No "module not found".

- [ ] **Step 3: Test suite matches baseline**

Run: `npm test`
Expected: `Tests  XXX passed` where **XXX == the number recorded in Task 0 Step 1**. Any drop = a move broke an import → fix before proceeding.

- [ ] **Step 4: Commit the structural move**

```powershell
git add -A
git commit -m @'
chore: promote v2 to repo root, archive v1

Move the entire v2/ Next.js app to the root via git mv (history preserved).
v1 (vanilla+Express) is archived on branch archive/v1 and removed from root.
Merge .gitignore; build + full test suite green from new root.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 6: Rewrite CLAUDE.md for v2 (was v1-centric)

**Files:** Modify `CLAUDE.md`.

**Preserve verbatim** (process, not v1-specific): everything from `## Workflow Rules` onward (AGENTS.md include, Session Boot Protocol, Superpowers Workflow, Knowledge Source Priority, Serena Memory Protocol, Mandatory Checkpoint). **Rewrite** the top: Project Overview, Tech Stack, Architecture, pages/endpoints, Build & Run.

- [ ] **Step 1: Replace the Tech Stack table**

New content:
```markdown
## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, React 19, TypeScript) |
| Auth | Auth.js v5 (Credentials, JWT) + RBAC (owner/admin/member/viewer) |
| DB / ORM | PostgreSQL 16 (Docker) + Drizzle ORM (node-postgres) |
| Styling | Tailwind CSS v4 |
| Realtime | Server-Sent Events (`/api/events` + `useLiveSessions`) |
| Charts / Graph / Map | recharts · @xyflow/react · react-leaflet |
| Markdown | react-markdown + remark-gfm + rehype-sanitize |
| Local LLM | Ollama (GPU), default `qwen3-vl:8b-instruct-q8_0` (POC) — see `.serena/memories/decisions/poc-model-choice.md` |
| OCR | system `tesseract` (vie+eng+chi_sim) |
| i18n | in-house provider (vi/en/zh, cookie `laam_lang`) |
| Tests | Vitest + Testing Library + jsdom |

The repo root **is** the Next.js app. The legacy v1 (vanilla JS + Express) is archived on branch `archive/v1`.
```

- [ ] **Step 2: Replace the Architecture section**

New content:
```markdown
## Architecture

Next.js App Router app; PostgreSQL via Drizzle; Ollama for chat. Monitoring data is parsed from Claude transcripts (`~/.claude/projects`) and local-model logs, upserted into Postgres, and streamed to the UI via SSE.

### Backend (`src/`)
- `src/db/schema.ts` — Drizzle schema (Auth.js tables + `machines`/`projects`/`agent_sessions`/`chat_*`/`connector_credentials`/`audit_log`).
- `src/lib/monitoring/*` — transcript + local-log parsers (ported from v1).
- `src/lib/sync.ts` — `upsertSessions`, `syncLocalMonitoring`.
- `src/lib/stats.ts` — `/api/stats` aggregation.
- `src/lib/connectors/*` — self-registering connectors (crypto + Postgres store + 7 services).
- `src/auth.ts` · `auth.config.ts` · `proxy.ts` — Auth.js + route protection.

### Routes (`src/app`)
- Pages: `/login /register /dashboard /agents /agents/[id] /chat /connectors /graph /machines`
- API: `/api/auth/[...nextauth]`, `/api/register`, `/api/sync`, `/api/ingest`, `/api/chat`(+`/info`), `/api/conversations`(+`/[id]`), `/api/connectors`(+`/[id]/[action]`), `/api/stats`, `/api/events`(SSE), `/api/ollama/models`, `/api/ocr`, `/api/fetch-url`, map helpers (`/api/geocode|reverse|route|nearby`), `/api/agents/[id]/timeline`.

### Multi-machine
`collector/laam-collector.mjs` (zero-dep) runs on each dev machine → pushes transcripts to `/api/ingest` (machine-token auth).

### Not yet ported from v1
See `.serena/memories/backlog/v1-unported.md` (Search, Office, proxy, `/api/config`, events table, machine/owner filter).
```

- [ ] **Step 3: Replace Build & Run Commands**

New content:
```markdown
## Build & Run Commands

```bash
# Infra (Postgres + Adminer)
docker compose up -d

# Env + schema (first run)
cp .env.example .env            # set AUTH_SECRET, DEFAULT_CHAT_MODEL, CONNECTOR_KEY
npm ci
npm run db:generate && npm run db:migrate

# Dev / prod
npm run dev                     # http://localhost:3000 (Turbopack)
npm run build && npm run start  # production
npm test                        # Vitest

# Local LLM (POC): Ollama + qwen3-vl:8b-instruct-q8_0 ; OCR: tesseract (vie)
# One-shot host setup: ./setup-poc.ps1  (Windows, run as Admin)
```

DB uses **migrations** (`db:generate` → commit `drizzle/` → `db:migrate`), never `db:push` on real data.
```

- [ ] **Step 4: Update Project Overview first paragraph**

Append to the overview: a sentence noting v2 is now the root app and v1 is archived on `archive/v1`. Leave the rest of the overview's intent intact.

- [ ] **Step 5: Verify process sections untouched + commit**

Run: `Select-String -Path CLAUDE.md -Pattern "Session Boot Protocol|Serena Memory Protocol|Superpowers Workflow"`
Expected: all three still present.
```powershell
git add CLAUDE.md
git commit -m "docs: rewrite CLAUDE.md architecture/stack/build for v2 (root)`n`nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: README + CHANGELOG

**Files:** Modify `README.md` (now v2's), `CHANGELOG.md`.

- [ ] **Step 1: Prepend a project intro to README.md**

The moved README is v2 dev-focused. Add a top section so root README describes the product:
```markdown
# LAAM — Local AI Agent Monitoring

Theo dõi real-time các Claude agent chạy local + trợ lý chat model-local + connectors — all local, model $0. **Next.js 16 + PostgreSQL + Auth.js + Drizzle.** Bản v1 (vanilla/Express) lưu ở branch `archive/v1`.

---
```
(keep the existing v2 Quick start / Scripts / Stack sections below.)

- [ ] **Step 2: Add CHANGELOG entry**

Under the top `## [Unreleased]` (create if missing, above `## [2.0.0]`):
```markdown
## [Unreleased]

### Changed
- **Tái cấu trúc repo:** v2 (Next.js) được đưa lên **root**; v1 (vanilla/Express) archive ở branch `archive/v1`. Root giờ là app v2.
- Gộp `.gitignore`; viết lại `CLAUDE.md`/`README` cho v2.

### Backlog (chưa migrate từ v1)
- Search, Office, proxy log Ollama, `/api/config` — xem `.serena/memories/backlog/v1-unported.md`.
```

- [ ] **Step 3: Commit**

```powershell
git add README.md CHANGELOG.md
git commit -m "docs: project README intro + CHANGELOG restructure entry`n`nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Sweep `v2/` paths in living Serena memories

**Files:** Modify living memories only (NOT checkpoints — those are historical record).

- [ ] **Step 1: Find living references to `v2/`**

Run: `Select-String -Path .serena/memories/INDEX.md,.serena/memories/services/*.md,.serena/memories/decisions/*.md,.serena/memories/backlog/*.md -Pattern "v2/"`
Expected: a list of `v2/src/...`, `v2/...` references (e.g. in `services/v2-app.md`).

- [ ] **Step 2: Rewrite each hit** `v2/src/` → `src/`, `v2/` (paths) → root, `cd v2 && ...` → root commands. Update `services/v2-app.md` Dev line + Lib paths + Routes; keep semantic notes. Do NOT touch `.serena/checkpoint/*` or `docs/superpowers/plans/*` (historical; they describe the state at their date).

- [ ] **Step 3: Add a note to services/v2-app.md**

Append: `> 2026-06-04: v2 đã lên ROOT (paths `v2/src` → `src`); v1 archive ở branch `archive/v1`.`

- [ ] **Step 4: Commit**

```powershell
git add .serena/memories
git commit -m "docs(serena): update living memory paths v2/ → root`n`nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Final verification + PR

**Files:** none.

- [ ] **Step 1: Re-verify build + tests from the committed root**

Run: `npm run build` then `npm test`
Expected: build green; tests == baseline XXX. (Catches any doc-sweep accident.)

- [ ] **Step 2: Sanity-check tree shape**

Run: `git ls-files | awk -F/ '{print $1}' | sort -u`
Expected top-level: `.claude .env.example .gitignore .serena AGENTS.md CHANGELOG.md CLAUDE.md README.md collector docs drizzle drizzle.config.ts next.config.ts package-lock.json package.json postcss.config.mjs scripts setup-poc.ps1 src tsconfig.json vitest.config.ts vitest.setup.ts` — and **no `v2/`, `public/`, `lib/`, `bin/`, `proxy/`**.

- [ ] **Step 3: Push + open PR**

```powershell
git push -u origin chore/v2-to-root
gh pr create --title "chore: promote v2 to root, archive v1" --body @'
Move v2/ Next.js app to repo root (git mv, history preserved). v1 archived on `archive/v1` (still runnable at :4317). Merged .gitignore; rewrote CLAUDE.md/README/CHANGELOG; swept Serena paths. Build + full Vitest suite green from new root.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
'@
```

- [ ] **Step 4: Checkpoint**

Write `.serena/checkpoint/claude-2026-06-04.md` (append): restructure done on `chore/v2-to-root`, archive/v1 pushed, PR open, baseline tests green. Next: run `setup-poc.ps1` + POC acceptance on the new root.

---

## Self-review notes
- **Spec coverage:** archive v1 ✓ (Task 0), move v2→root ✓ (Tasks 1–2), collisions ✓ (Tasks 1–3), path fixes ✓ (Task 4), docs ✓ (Tasks 6–7), Serena ✓ (Task 8), verify ✓ (Tasks 5, 9). Backlog already recorded (prior step).
- **Reversibility:** everything pre-merge lives on `chore/v2-to-root`; v1 on `archive/v1`. Abort = `git switch main` + delete branch.
- **Risk:** the only true verification gate is Task 5/9 (build+test). If red, an import broke — fix before commit.
- **Rollback of running v1 :4317:** `git worktree add ../laam-v1 archive/v1` then run there, if the old app must keep serving during transition.
