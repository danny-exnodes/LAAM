# Decision: Full Docker stack + Tailscale Funnel publish

**Date:** 2026-06-04 · **Author:** claude-docker session (parallel with FE + OCR sessions)

## What shipped
LAAM v2 runtime now runs as a production Docker stack, publicly served via the
already-authorized Tailscale Funnel.

- **App image** `laam-app:latest` — multi-stage, `node:22-alpine`, Next 16
  **standalone** output (`output:'standalone'` → `.next/standalone/server.js`),
  `NODE_ENV=production`, non-root `node`, healthcheck on `/login`. 460 MB.
- **Compose** (`docker-compose.yml`, root, existing `laam` project): added `app`
  service. App↔Postgres is **internal** (`postgres:5432`); reused the existing
  `laam-v2-pg` volume (11 tables persist) — no in-container migrate.
- **Ollama stays native on host GPU** — container reaches it via
  `host.docker.internal:11434` (`extra_hosts: host-gateway`). See
  [[poc-host-and-ollama-ops]]. No GPU passthrough into Docker.
- **Tesseract OCR baked into the image** per [[ocr-tesseract-docker]] handoff:
  `apk add tesseract-ocr tesseract-ocr-data-{eng,vie,chi_sim}` in runner stage
  before `USER node`. `eng` explicit (route default `-l vie+eng+chi_sim`).
  Verified `--list-langs` → chi_sim/eng/vie in the running container.

## Dedicated port block (39xx) — avoid collision with other Docker apps
| Service | container | host (published) |
|---|---|---|
| app | 3000 | **3900** (Funnel target) |
| postgres | 5432 | 5432 now → **3932** after final step |
| adminer | 8080 | 8080 now → **3980** after final step |
| dev (host, not Docker) | — | 3000 now → **3100** after final step |

## Funnel
Funnel was already authorized (no admin-console step needed). Repointed
`/ -> 127.0.0.1:3900`. Public URL: `https://danny-gaming-pc.tail41dda4.ts.net`.
Rollback: `tailscale funnel --bg 3000` (or `tailscale funnel --https=443 off`).

## Auth.js behind Funnel (verified)
Funnel terminates TLS → forwards HTTP to :3900. Set `AUTH_TRUST_HOST=true` +
`AUTH_URL=https://danny-gaming-pc.tail41dda4.ts.net` (compose `environment:`
overrides `.env`). Verified: public `/api/auth/csrf` → 200 with a **Secure**
Set-Cookie. So secure cookies/callbacks are correct behind the proxy.

## Key build gotchas (caught + fixed)
1. **No `public/` dir** in this app → unconditional `cp -r public ...` failed the
   build. Fixed: copy `.next/static` always, copy `public` only `if [ -d public ]`.
2. Standalone **omits** `public/` + `.next/static/` by design → must copy
   `.next/static` into `.next/standalone/.next/static` or the app serves no CSS/JS.
3. **`HOSTNAME=0.0.0.0`** in the image — standalone server defaults to `localhost`,
   which makes the published port unreachable.

## Isolation / worktree (server-protection)
Built in worktree `D:\Projects\personal_projects\LAAM-docker` (branch
`infra/docker-stack`, commits `0f1503e`, `ba318d1`) so the only `next dev`-watched
edit (`next.config.ts`) never touched the FE session's live `:3000` tree. Compose
on main references the **pre-built** `image: laam-app:latest`, so main needs no
Dockerfile yet. The branch is merged + compose switched to `build: .` only in the
deferred final step.

## Not done yet (deferred — coordinate with FE session; needs the dev server bounced)
Final step: renumber pg→3932/adminer→3980, move dev→3100 (update `.env`
`DATABASE_URL` host port), merge `infra/docker-stack` to main, switch compose
`app` to `build: .`, remove worktree. Plan Task 10 in
`docs/superpowers/plans/2026-06-04-docker-stack-tailscale-funnel.md`.

## Commits (main)
`854498e` spec · `6e6d9c5` plan · `e40d764` plan(+tesseract) · `0ab2822` compose app service.
Worktree branch `infra/docker-stack`: `0f1503e` (Dockerfile/.dockerignore/next.config) · `ba318d1` (public guard).
