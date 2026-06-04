# Checkpoint: claude-docker — 2026-06-04

Scope: ONLY Docker stack + Tailscale Funnel (parallel session; others: responsive FE, OCR).
Detail: [[docker-deploy]]. Plan: docs/superpowers/plans/2026-06-04-docker-stack-tailscale-funnel.md.

## What was done
- Dockerized the LAAM app as a production standalone image (`laam-app:latest`,
  multi-stage node:22-alpine, non-root, healthcheck), built in worktree
  `LAAM-docker` (branch `infra/docker-stack`).
- Baked Tesseract OCR (eng/vie/chi_sim) into the image per claude-ocr handoff.
- Added `app` service to root `docker-compose.yml` on the 39xx block (:3900),
  reusing the existing Postgres + `laam-v2-pg` volume; Ollama stays host-native
  (host.docker.internal). Brought it up; verified end-to-end.
- Repointed Tailscale Funnel `/ -> 127.0.0.1:3900`. Public app is LIVE.

## Files changed
- Worktree branch `infra/docker-stack`: `Dockerfile`, `.dockerignore`, `next.config.ts` (output:standalone).
- main: `docker-compose.yml` (+app service, `0ab2822`); docs spec+plan; this checkpoint + decisions/docker-deploy.md.
- NOT touched: any `src/`, and the FE session's uncommitted changes on main.

## Current state (verified live)
- `laam-app:latest` healthy on :3900. /login 200 (host + public). Assets wired.
- Ollama bridge OK (qwen3-vl:8b-instruct-q8_0). DB reachable (postgres:5432).
- OCR langs chi_sim/eng/vie in running container.
- Public: https://danny-gaming-pc.tail41dda4.ts.net/login 200; /api/auth/csrf 200 + Secure cookie.
- **Dev :3000 NEVER interrupted** (still 200 throughout) — FE session unaffected.

## Update — 2 (2026-06-04, later)
- **Dev SSL**: set up Tailscale Serve HTTPS `:8443 → :3100` (tailnet-only, valid LE
  cert); prod Funnel `:443→:3900` unchanged. Responded to FE handoff
  [[networking-dev-ssl-and-auth-url]] (FE to set dev `AUTH_URL=https://...:8443`).
- **Merged `infra/docker-stack` → main** (`fc52207`); next.config conflict resolved to
  combined dev+prod config (`0fc23c7`, FE's `allowedDevOrigins` preserved).
  **Branch + worktree RETAINED** (user said don't delete).
- **Rebuilt prod image** from clean worktree → byte-identical (no app code committed);
  container recreated, **healthy on :3900**, local+public /login 200, OCR+Ollama OK.
- Compose deliberately still `image:` (not `build: .`) — main tree holds FE WIP.

## Next steps
- USER: register first account at the public URL → becomes owner (P0). (Note: `user`
  table already has 2 rows — may already be done.)
- pg/adminer renumber to 39xx still pending — [[docker-port-renumber]].
- When FE commits their WIP: can switch compose `app` to `build: .` (build from main).
- Cleanup: `backlog/docker-stack-tesseract.md` handoff FULFILLED → can be deleted.

## Blockers / Risks
- Test suite NOT run: my changes add no tested source to main (compose/Dockerfile
  untested; next.config standalone is worktree-only build setting), and the main
  tree currently holds the FE session's in-progress WIP — running it would test
  their unfinished work, not mine. Baseline unaffected by construction. Can run in
  the worktree (clean main + standalone) on request.
- Funnel now serves the Docker app, not dev :3000. Reversible: `tailscale funnel --bg 3000`.
