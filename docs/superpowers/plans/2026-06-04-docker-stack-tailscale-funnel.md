# Docker Stack + Tailscale Funnel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the LAAM v2 runtime (Next.js app + Postgres + Adminer) into one production-grade `docker compose` stack on a dedicated `39xx` port block, then publish it via the already-authorized Tailscale Funnel — without interrupting the `:3000` dev server.

**Architecture:** Multi-stage production Dockerfile (`next build` → standalone) builds an image in an isolated git worktree (so the watched `next.config.ts` edit never disturbs the running dev server). The `app` service is added to the existing compose project so it shares the network with the already-running Postgres (reused volume, internal `postgres:5432`). Ollama stays native on the host GPU, reached via `host.docker.internal:11434`. Funnel is repointed from `:3000` to the container on `:3900` after verification.

**Tech Stack:** Docker Engine 28.5 / Compose v2.40, Next.js 16.2.7 standalone output, Node 22-alpine, PostgreSQL 16-alpine, Tailscale 1.98 Funnel.

**Spec:** `docs/superpowers/specs/2026-06-04-docker-stack-tailscale-funnel-design.md`

---

## File Structure

| File | Responsibility | Where it lives |
|---|---|---|
| `Dockerfile` | Multi-stage production build → standalone runner | worktree (merged to main in final step) |
| `.dockerignore` | Keep build context small; exclude `.env`, `.next`, `node_modules`, `.serena`, `docs` | worktree → main |
| `next.config.ts` | Add `output: 'standalone'` | worktree → main |
| `docker-compose.yml` | Add `app` service; (final step) renumber pg/adminer ports | **main** (not watched by `next dev`) |

**Port block (`39xx`):** app `3900:3000`, postgres `3932:5432`, adminer `3980:8080`. Dev server moves to `3100` (final step).

---

## Task 0: Create the isolated worktree

**Files:** none (git operation)

- [ ] **Step 1: Confirm the dev server state we must protect**

Run:
```powershell
(Invoke-WebRequest -UseBasicParsing -Uri http://localhost:3000 -TimeoutSec 3).StatusCode 2>&1
```
Expected: `200` if the parallel session's dev server is up (treat as live regardless — protect `:3000`).

- [ ] **Step 2: Create the worktree via the using-git-worktrees skill**

Invoke `superpowers:using-git-worktrees`. Target: a sibling worktree on a short-lived branch `infra/docker-stack`, e.g. `D:\Projects\personal_projects\LAAM-docker`. Rationale: the only `next dev`-watched edit (`next.config.ts`) happens here, so the main working tree the dev server watches is never touched until the final coordinated merge.

- [ ] **Step 3: Verify the worktree exists**

Run:
```powershell
git -C "D:\Projects\personal_projects\LAAM" worktree list
```
Expected: lists the main checkout plus the new `LAAM-docker` worktree on `infra/docker-stack`.

---

## Task 1: `.dockerignore` (worktree)

**Files:**
- Create: `<worktree>/.dockerignore`

- [ ] **Step 1: Write `.dockerignore`**

```
# Build artifacts & deps (re-installed/built inside the image)
node_modules
.next
out

# Secrets — supplied at runtime via compose env_file, never baked in
.env
.env.*

# VCS / tooling / docs not needed at runtime
.git
.gitignore
.serena
docs
collector
drizzle.config.ts
**/*.test.ts
**/*.test.tsx
vitest.config.*
.vscode
.claude
```

- [ ] **Step 2: Commit**

```powershell
git -C "<worktree>" add .dockerignore
git -C "<worktree>" commit -m "build(docker): add .dockerignore (exclude secrets, deps, artifacts)"
```

---

## Task 2: Enable standalone output (worktree)

**Files:**
- Modify: `<worktree>/next.config.ts`

- [ ] **Step 1: Edit `next.config.ts`**

Replace the body so it reads:
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-hosted in Docker: emit a self-contained server (.next/standalone/server.js)
  // so the runtime image needs neither the full node_modules nor `next start`.
  output: "standalone",
};

export default nextConfig;
```

- [ ] **Step 2: Commit**

```powershell
git -C "<worktree>" add next.config.ts
git -C "<worktree>" commit -m "build(docker): enable Next standalone output for container image"
```

---

## Task 3: Multi-stage production Dockerfile (worktree)

**Files:**
- Create: `<worktree>/Dockerfile`

- [ ] **Step 1: Write the Dockerfile**

```dockerfile
# syntax=docker/dockerfile:1

# ---- deps: install full dependencies for the build ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: production build → .next/standalone ----
FROM node:22-alpine AS builder
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
# Standalone omits public/ and .next/static/ by design — copy them in.
RUN cp -r public .next/standalone/public \
 && cp -r .next/static .next/standalone/.next/static

# ---- runner: minimal production image ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# --- OCR: system tesseract + language data for /api/ocr (execFile "tesseract") ---
# Needs root, so it runs BEFORE `USER node`. eng is NOT bundled with Alpine's
# tesseract-ocr package, and route.ts defaults to `-l vie+eng+chi_sim`, so eng
# must be listed explicitly or every default OCR call fails. (Verified by the
# claude-ocr session: see .serena/memories/decisions/ocr-tesseract-docker.md.)
RUN apk add --no-cache \
      tesseract-ocr \
      tesseract-ocr-data-eng \
      tesseract-ocr-data-vie \
      tesseract-ocr-data-chi_sim
# Run as the built-in non-root user.
USER node
COPY --from=builder --chown=node:node /app/.next/standalone ./
EXPOSE 3000
# Node 22 has global fetch; /login is public (no auth) → 200 when healthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
```

- [ ] **Step 2: Verify a lockfile exists (the Dockerfile assumes `npm ci`)**

Run:
```powershell
Test-Path "<worktree>\package-lock.json"
```
Expected: `True`. If `False`, generate it first with `npm install --package-lock-only` in the worktree and commit it (the spec/`package.json` pin exact deps, so this is deterministic).

- [ ] **Step 3: Commit**

```powershell
git -C "<worktree>" add Dockerfile
git -C "<worktree>" commit -m "build(docker): multi-stage production Dockerfile (standalone, non-root)"
```

---

## Task 4: Build the production image

**Files:** none (build)

- [ ] **Step 1: Build from the worktree context**

Run:
```powershell
docker build -t laam-app:latest "D:\Projects\personal_projects\LAAM-docker"
```
Expected: build completes; final line `naming to docker.io/library/laam-app:latest`. The `npm run build` stage must finish with Next's "Compiled successfully" / route table. **If the build fails, STOP** — a failing production build is a real defect to fix, not to bypass.

- [ ] **Step 2: Verify the image and that standalone server.js is present**

Run:
```powershell
docker images laam-app:latest
docker run --rm --entrypoint node laam-app:latest -e "console.log(require('fs').existsSync('/app/server.js'))"
```
Expected: image listed; second command prints `true`.

- [ ] **Step 3: Verify static assets were copied into the image**

Run:
```powershell
docker run --rm --entrypoint sh laam-app:latest -c "ls .next/static >/dev/null 2>&1 && echo static-ok; ls public >/dev/null 2>&1 && echo public-ok"
```
Expected: `static-ok` and `public-ok` (proves the CSS/JS/image fix from the standalone gotcha worked).

---

## Task 5: Confirm `.env` provides required runtime secrets

**Files:** none (read-only check; do NOT print values)

- [ ] **Step 1: Verify required keys exist in the gitignored `.env`**

Run:
```powershell
$envKeys = (Get-Content "D:\Projects\personal_projects\LAAM\.env") -match '^\s*[A-Z]' | ForEach-Object { ($_ -split '=')[0].Trim() }
'AUTH_SECRET','DEFAULT_CHAT_MODEL' | ForEach-Object { "$_`: $(if ($envKeys -contains $_) {'present'} else {'MISSING'})" }
```
Expected: both `present`. If `AUTH_SECRET` is MISSING, STOP and tell the user to set it (`openssl rand -base64 32`) — the app will not boot without it.

---

## Task 6: Add the `app` service to compose (main working tree)

**Files:**
- Modify: `D:\Projects\personal_projects\LAAM\docker-compose.yml`

> `docker-compose.yml` is **not** watched by `next dev`, so editing it in the main tree does not disturb the dev server.

- [ ] **Step 1: Add the `app` service** (insert before the `volumes:` block, after `adminer`)

```yaml
  # LAAM v2 production app (standalone Next.js). Image is built from the
  # infra/docker-stack worktree: `docker build -t laam-app:latest <worktree>`.
  # Reaches Postgres internally (postgres:5432) and host-native Ollama via
  # host.docker.internal. Public via Tailscale Funnel -> 127.0.0.1:3900.
  app:
    image: laam-app:latest
    container_name: laam-v2-app
    ports:
      - "3900:3000"
    env_file:
      - .env
    environment:
      # Overrides win over env_file: point at the in-network DB + host Ollama.
      DATABASE_URL: postgresql://laam:laam@postgres:5432/laam
      OLLAMA_URL: http://host.docker.internal:11434
      AUTH_TRUST_HOST: "true"
      AUTH_URL: https://danny-gaming-pc.tail41dda4.ts.net
      NODE_ENV: production
    extra_hosts:
      - "host.docker.internal:host-gateway"
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped
```

- [ ] **Step 2: Validate the compose file parses**

Run:
```powershell
docker compose -f "D:\Projects\personal_projects\LAAM\docker-compose.yml" config --quiet; if ($?) { "compose-valid" }
```
Expected: `compose-valid` (no YAML/schema errors).

- [ ] **Step 3: Commit the compose change to main**

```powershell
git -C "D:\Projects\personal_projects\LAAM" add docker-compose.yml
git -C "D:\Projects\personal_projects\LAAM" commit -m "feat(docker): add production app service on :3900 (image laam-app:latest)"
```

---

## Task 7: Bring up the app container and verify it end-to-end

**Files:** none (runtime verification)

- [ ] **Step 1: Start the app service (postgres/adminer already running)**

Run:
```powershell
docker compose -f "D:\Projects\personal_projects\LAAM\docker-compose.yml" up -d app
```
Expected: `Container laam-v2-app  Started`. Postgres reports healthy via `depends_on`.

- [ ] **Step 2: Wait for health, then confirm container is healthy**

Run:
```powershell
docker inspect --format '{{.State.Health.Status}}' laam-v2-app
```
Expected: `healthy` (retry for up to ~1 min; `start-period` is 40s).

- [ ] **Step 3: Confirm the app serves on the dedicated port with working assets**

Run:
```powershell
(Invoke-WebRequest -UseBasicParsing http://localhost:3900/login).StatusCode
(Invoke-WebRequest -UseBasicParsing http://localhost:3900/login).Content -match '_next/static' | Out-Null; "assets-referenced: $($matches.Count -gt 0)"
```
Expected: `200`; assets referenced (proves CSS/JS are wired, not a bare HTML shell).

- [ ] **Step 4: Confirm DB connectivity from the container (no error logs)**

Run:
```powershell
docker logs laam-v2-app --tail 40
```
Expected: Next "Ready" / listening on `:3000`; **no** `ECONNREFUSED`, `getaddrinfo`, or Postgres auth errors. (Internal `postgres:5432` resolves over the compose network.)

- [ ] **Step 5: Confirm the container can reach host-native Ollama**

Run:
```powershell
docker exec laam-v2-app node -e "fetch('http://host.docker.internal:11434/api/tags').then(r=>r.json()).then(j=>console.log('ollama-ok', j.models?.length ?? 0)).catch(e=>{console.error('ollama-FAIL', e.message); process.exit(1)})"
```
Expected: `ollama-ok <n>` with n ≥ 1 (the `qwen3-vl` model is listed). Proves `host.docker.internal:11434` bridges into the host GPU Ollama.

- [ ] **Step 6: Confirm Tesseract OCR is available in the image (all 3 languages)**

Run:
```powershell
docker exec laam-v2-app tesseract --list-langs 2>&1
```
Expected: list includes `chi_sim`, `eng`, `vie` (proves the `apk add` baked the engine + all three traineddata; `eng` present guards the default `vie+eng+chi_sim` path). If any is missing, the runner-stage `apk add` is wrong — fix and rebuild.

- [ ] **Step 7: Confirm the `:3000` dev server is still alive (was never interrupted)**

Run:
```powershell
try { "dev-3000: $((Invoke-WebRequest -UseBasicParsing http://localhost:3000 -TimeoutSec 3).StatusCode)" } catch { "dev-3000: down (note in checkpoint if it was up before)" }
```
Expected: same state as Task 0 Step 1 — the parallel session's server unaffected.

---

## Task 8: Repoint Tailscale Funnel → :3900

**Files:** none (network change — outward-facing, reversible)

- [ ] **Step 1: Record the current funnel mapping (rollback reference)**

Run:
```powershell
tailscale funnel status
```
Expected: shows `/ proxy http://127.0.0.1:3000` (the pre-change state to revert to if needed).

- [ ] **Step 2: Repoint funnel to the container port**

Run:
```powershell
tailscale funnel --bg 3900
```
If this errors needing `reset` first:
```powershell
tailscale funnel reset; tailscale funnel --bg 3900
```
Expected: prints the public URL `https://danny-gaming-pc.tail41dda4.ts.net` now serving port 3900. **If Tailscale prompts for login or reports a missing `funnel`/HTTPS node attribute, STOP** and give the user the exact admin-console step (Access Controls → `nodeAttrs` grant `funnel`, and DNS → enable HTTPS Certificates). Current host already has these, so this is a guard, not an expectation.

- [ ] **Step 3: Verify the new funnel mapping**

Run:
```powershell
tailscale funnel status
```
Expected: `/ proxy http://127.0.0.1:3900`.

---

## Task 9: Verify the public URL end-to-end (incl. Auth behind Funnel)

**Files:** none (runtime verification — highest-risk item)

- [ ] **Step 1: Public URL serves the app over HTTPS**

Run:
```powershell
(Invoke-WebRequest -UseBasicParsing https://danny-gaming-pc.tail41dda4.ts.net/login).StatusCode
```
Expected: `200` (TLS terminated by Funnel, forwarded to the container).

- [ ] **Step 2: Verify Auth.js behaves correctly behind the Funnel proxy**

Run:
```powershell
$r = Invoke-WebRequest -UseBasicParsing https://danny-gaming-pc.tail41dda4.ts.net/api/auth/csrf
"csrf-status: $($r.StatusCode)"; "set-cookie-present: $([bool]$r.Headers['Set-Cookie'])"
```
Expected: `200` and a `Set-Cookie` (CSRF token cookie issued over HTTPS). This confirms `AUTH_TRUST_HOST` + `AUTH_URL` produce correct secure cookies behind the proxy.

- [ ] **Step 3: Manual owner-register smoke (user-facing confirmation)**

Ask the user to open `https://danny-gaming-pc.tail41dda4.ts.net`, register the first account (= owner), and confirm login succeeds. **If login fails with a CSRF/redirect/secure-cookie error**, this is the predicted Auth-behind-Funnel risk: capture the exact error, then (coordinating with the frontend session, since `auth.config.ts` is shared) adjust cookie/`useSecureCookies`/`AUTH_URL` settings. Do not silently work around it.

---

## Task 10: FINAL coordinated step — renumber + dev→3100 + consolidate (DEFERRABLE)

> Do this only when the frontend session is at a safe stopping point — it is the one step that touches the dev server. Until then, Tasks 1–9 already deliver a working, publicly-served Docker stack.

**Files:**
- Modify: `D:\Projects\personal_projects\LAAM\docker-compose.yml` (postgres/adminer ports)
- Modify: `D:\Projects\personal_projects\LAAM\.env` (DATABASE_URL → host port 3932) — gitignored, not committed

- [ ] **Step 1: Merge the worktree branch into main (brings Dockerfile/.dockerignore/next.config)**

```powershell
git -C "D:\Projects\personal_projects\LAAM" merge --no-ff infra/docker-stack -m "build(docker): land Dockerfile + standalone config on main"
```
Note: this updates main's `next.config.ts` → the dev server will recompile once. Acceptable now (coordinated stop).

- [ ] **Step 2: Switch the `app` service to build from main and renumber pg/adminer**

In `docker-compose.yml`: change `app` from `image: laam-app:latest` to `build: { context: ., dockerfile: Dockerfile }` (keep `image: laam-app:latest` as the tag). Change `postgres` ports to `"3932:5432"` and `adminer` ports to `"3980:8080"`.

- [ ] **Step 3: Update dev `.env` and recreate the stack**

In `.env` set `DATABASE_URL=postgresql://laam:laam@localhost:3932/laam` (host-side dev app now reaches DB on the new published port; the container still uses internal `postgres:5432`).

Run:
```powershell
docker compose -f "D:\Projects\personal_projects\LAAM\docker-compose.yml" up -d --build
```
Expected: postgres now published on 3932, adminer on 3980, app rebuilt and healthy on 3900.

- [ ] **Step 4: Restart the dev server on 3100**

Coordinate with the frontend session. New dev command:
```powershell
$env:PORT=3100; npm run dev
```
Expected: dev server on `http://localhost:3100`, connecting to DB on `localhost:3932`.

- [ ] **Step 5: Commit compose; remove the worktree**

```powershell
git -C "D:\Projects\personal_projects\LAAM" add docker-compose.yml
git -C "D:\Projects\personal_projects\LAAM" commit -m "build(docker): build app from main; move pg/adminer to 39xx block"
git -C "D:\Projects\personal_projects\LAAM" worktree remove "D:\Projects\personal_projects\LAAM-docker"
```

---

## Task 11: Verify baseline + record state

**Files:**
- Create: `.serena/checkpoint/claude-2026-06-04.md` (append if exists)
- Create/Update: `.serena/memories/services/v2-app.md` or `decisions/docker-deploy.md`

- [ ] **Step 1: Run the test suite (baseline 375)**

Run:
```powershell
npm test
```
Expected: all pass (baseline 375). Standalone/Docker changes touch no app logic, so the suite stays green.

- [ ] **Step 2: Write the Serena decision memory**

Create `.serena/memories/decisions/docker-deploy.md` documenting: full stack in compose, `39xx` block, host-native Ollama via `host.docker.internal`, reused `laam-v2-pg` volume, Funnel → :3900, the standalone static-asset copy gotcha, and Auth-behind-Funnel settings. Add an INDEX.md pointer.

- [ ] **Step 3: Write the mandatory checkpoint**

Create `.serena/checkpoint/claude-2026-06-04.md` per CLAUDE.md format (what was done / files changed / current state / next steps / blockers).

- [ ] **Step 4: Commit docs**

```powershell
git -C "D:\Projects\personal_projects\LAAM" add .serena
git -C "D:\Projects\personal_projects\LAAM" commit -m "docs(serena): record Docker deploy decision + checkpoint"
```

---

## Success Criteria (from spec)

- [ ] `docker build` produces a clean production image; standalone `server.js` + copied static assets verified.
- [ ] `docker compose up -d` → app+postgres+adminer healthy.
- [ ] `http://localhost:3900` serves the app with working assets; container reaches Postgres (internal) and host Ollama.
- [ ] Tesseract OCR works in-container: `tesseract --list-langs` → chi_sim/eng/vie (per claude-ocr handoff).
- [ ] `https://danny-gaming-pc.tail41dda4.ts.net` serves the app; CSRF cookie issued over HTTPS; owner can register/login.
- [ ] `:3000` dev server never interrupted during Tasks 1–9.
- [ ] No secrets committed; `.env` still gitignored.
- [ ] 375-test baseline green; checkpoint + Serena memory written.
