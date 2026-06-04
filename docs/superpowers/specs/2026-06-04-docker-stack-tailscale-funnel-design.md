# Spec: Full Docker stack + Tailscale Funnel publish

- **Date**: 2026-06-04
- **Author**: Claude (infra session — runs in parallel with a frontend/responsive session)
- **Status**: Awaiting user review
- **Scope**: Infrastructure / Docker / networking only. **No UI changes** (the parallel session owns the frontend).

## Goal

Dockerize the entire LAAM v2 runtime (the Next.js app plus its data dependencies) into one
production-grade `docker compose` stack, then publish it to the public internet via
`tailscale funnel`. Keep the existing developer workflow uninterrupted.

## Constraints (from user)

1. The Docker app **must be a proper production build** (multi-stage, `next build`,
   `NODE_ENV=production`, standalone output — not `next dev`, not a dev tree).
2. The Dockerized LAAM stack uses **its own distinct port block** to avoid colliding with
   other Docker apps on the host.
3. The **dev workflow moves to port 3100** (was 3000).
4. `.env` is gitignored — **no secrets committed**.
5. The currently running `:3000` dev server (used by the parallel frontend session) **must
   not be interrupted** mid-flight. Use a git worktree to isolate disruptive edits.
6. If `tailscale funnel` needs interactive login / admin-console grants, **stop and tell the
   user the exact steps**.

## Pre-resolved facts (verified on host, 2026-06-04)

- Docker Engine 28.5.2, Compose v2.40.3. Running: `laam-v2-postgres` (5432), `laam-v2-adminer` (8080).
- Tailscale 1.98.4. **Funnel already authorized and ON**:
  `https://danny-gaming-pc.tail41dda4.ts.net` → currently proxies `http://127.0.0.1:3000`.
  → **No admin-console / login step is required** (the normally-blocking risk is pre-cleared).
- App: Next.js 16.2.7, React 19. `next.config.ts` is effectively empty. No Dockerfile yet.
- Ollama native on host, GPU, `:11434`, model `qwen3-vl:8b-instruct-q8_0`.
- Serena decision `poc-host-and-ollama-ops` ratifies **host-native GPU Ollama**.

## Architecture

```
                    Internet (public)
        https://danny-gaming-pc.tail41dda4.ts.net
                       │  Tailscale Funnel (TLS terminated by tailscaled)
                       ▼
              host 127.0.0.1:3900
   ┌───────────────────────────────────────────────┐
   │  docker compose project "laam"  (bridge net)   │
   │                                                │
   │   app (Next.js 16 standalone, prod) :3000→3900 │
   │      │  postgresql://postgres:5432  (internal) │
   │      ▼                                          │
   │   postgres:16-alpine  :5432 → host 3932         │
   │   adminer             :8080 → host 3980         │
   └──────────────┬─────────────────────────────────┘
                  │ host.docker.internal:11434
                  ▼
        Ollama (NATIVE on host, GPU)  ← stays OUTSIDE Docker
```

### Why Ollama stays native (not containerized)

- Serena decision already ratified host-native GPU inference.
- NVIDIA GPU passthrough into Docker Desktop/WSL2 for a Blackwell RTX 50-series card is
  fragile (driver/CUDA coupling) and would force re-pulling the 9.8 GB model into a volume.
- Already runs at 100% GPU. The container reaches it via `host.docker.internal:11434` — no
  GPU complexity inside Docker.

## Dedicated port block (`39xx`)

| Service | Container port | Host (published) | Purpose |
|---|---|---|---|
| `app` | 3000 | **3900** | Funnel target; production app |
| `postgres` | 5432 | **3932** | host tools (drizzle migrate, dev app) |
| `adminer` | 8080 | **3980** | DB UI |
| dev server (NOT Docker) | — | **3100** | parallel frontend session |

`app → postgres` is **internal** (`postgres:5432` over the compose network); it does not
depend on the published host port.

## Components

### 1. `Dockerfile` (multi-stage, production)

- **Stage `deps`**: `node:22-alpine`, `npm ci` (full deps for build).
- **Stage `builder`**: copy source, `NODE_ENV=production`, `next build` with
  `output: 'standalone'`. Build fails the image if the app doesn't compile.
- **Stage `runner`**: `node:22-alpine`, `NODE_ENV=production`, non-root `node` user, copy only
  `.next/standalone`, `.next/static`, `public`. `EXPOSE 3000`, `CMD ["node","server.js"]`.
- **Must follow Next 16's current standalone guidance** — read `node_modules/next/dist/docs/`
  before finalizing (static-asset copy paths / entrypoint changed across versions).

### 2. `.dockerignore`

Exclude `node_modules`, `.next`, `.git`, `.env*`, `docs`, `.serena`, test output — keep the
build context small and prevent host `.next`/`node_modules` from leaking into the image.

### 3. `next.config.ts` change (the only watched-file edit → done in worktree)

```ts
const nextConfig: NextConfig = {
  output: "standalone",
};
```

### 4. `docker-compose.yml` — add `app` service (extend existing project)

- `build: { context: ., dockerfile: Dockerfile }`
- `ports: ["3900:3000"]`
- `env_file: .env` **+** `environment:` overrides (precedence over env_file):
  - `DATABASE_URL=postgresql://laam:laam@postgres:5432/laam`
  - `OLLAMA_URL=http://host.docker.internal:11434`
  - `AUTH_TRUST_HOST=true`
  - `AUTH_URL=https://danny-gaming-pc.tail41dda4.ts.net`
  - `NODE_ENV=production`
- `extra_hosts: ["host.docker.internal:host-gateway"]`
- `depends_on: { postgres: { condition: service_healthy } }`
- `restart: unless-stopped`
- healthcheck hitting an app route (e.g. `/login` or `/api/...`).
- Postgres/adminer published-port renumber to `3932`/`3980` applied as the **final** step.

## Data / DB

Reuse the existing `laam-v2-pg` volume (11 migrated tables persist). **No migration step in the
container** — schema is already migrated; future schema changes run from the host
(`npm run db:migrate`) as today.

## Secrets

`.env` (gitignored) supplies `AUTH_SECRET`, `CONNECTOR_KEY`, `DEFAULT_CHAT_MODEL`. Compose
`environment:` overrides only host-specific URLs. Nothing secret enters Dockerfile/compose.

## Auth.js behind Funnel

Funnel terminates TLS and forwards HTTP to `127.0.0.1:3900`. Set `AUTH_TRUST_HOST=true` and
`AUTH_URL=https://danny-gaming-pc.tail41dda4.ts.net` so callback URLs and secure cookies are
correct. **Runtime-verify**: register/login over the public URL works (cookies set, no
CSRF/redirect mismatch). This is the highest-risk runtime item and gets explicit verification.

## Sequencing (protects the running `:3000` server)

1. **Worktree**: add `Dockerfile`, `.dockerignore`, `output:'standalone'`, extend
   `docker-compose.yml`. *(Dev server's tree untouched.)*
2. `docker compose build app` → `up -d app` on **3900**, talking to existing Postgres
   internally. *(Dev `:3000` untouched.)*
3. Verify container: app loads on `http://localhost:3900`, DB connects, Ollama reachable.
4. **Repoint Funnel** → `127.0.0.1:3900`; verify the public URL end-to-end.
5. **Final, coordinated, deferrable step**: renumber `postgres`→3932 / `adminer`→3980, move
   dev→`3100` (update its `DATABASE_URL`). Only step touching the dev server → done last.

## Success criteria

- [ ] `docker compose build app` succeeds (production build, no errors).
- [ ] `docker compose up -d` brings app+postgres+adminer healthy.
- [ ] App container is a production build (`NODE_ENV=production`, standalone `server.js`, no dev deps).
- [ ] `http://localhost:3900` serves the app; DB-backed pages work; chat reaches host Ollama.
- [ ] Funnel serves the app at `https://danny-gaming-pc.tail41dda4.ts.net` (verified externally).
- [ ] Auth works over the public URL (register/login, cookies).
- [ ] Existing `:3000` dev server was never interrupted during steps 1–4.
- [ ] No secrets committed; `.env` still gitignored.
- [ ] 375-test baseline still green; checkpoint + Serena memory written.

## Out of scope

- UI / responsive work (parallel session).
- Containerizing Ollama / GPU passthrough.
- Windows Service / pm2 durability (backlog P1).
- Hardening/audit-log/load-test (backlog P3) beyond what Funnel needs to work.

## Open questions (defaulted unless user objects)

1. Port block `39xx` — accepted as default.
2. Renumber + dev→3100 as final coordinated step — accepted as default.
