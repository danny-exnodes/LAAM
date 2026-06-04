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

## Next steps
- USER: register first account at the public URL → becomes owner (P0).
- DEFERRED final step (coordinate w/ FE, bounces dev server): renumber pg→3932 /
  adminer→3980, dev→3100 (+.env DATABASE_URL), merge `infra/docker-stack` to main,
  switch compose `app` to `build: .`, remove worktree. See plan Task 10.
- Cleanup: `backlog/docker-stack-tesseract.md` handoff is FULFILLED → can be deleted
  (left in place; it's another session's untracked file).

## Blockers / Risks
- Test suite NOT run: my changes add no tested source to main (compose/Dockerfile
  untested; next.config standalone is worktree-only build setting), and the main
  tree currently holds the FE session's in-progress WIP — running it would test
  their unfinished work, not mine. Baseline unaffected by construction. Can run in
  the worktree (clean main + standalone) on request.
- Funnel now serves the Docker app, not dev :3000. Reversible: `tailscale funnel --bg 3000`.
