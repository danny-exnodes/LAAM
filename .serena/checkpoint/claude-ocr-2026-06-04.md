# Checkpoint: claude-ocr — 2026-06-04

Scope: ONLY Tesseract/OCR (session 3 of 3 parallel; others: responsive FE, docker stack).

## What was done
- Analyzed `/api/ocr` (route.ts): shells out to system `tesseract`, default lang `vie+eng+chi_sim`.
- Verified the Docker OCR solution end-to-end on the app's exact base `node:22-alpine`:
  installed `tesseract-ocr` + data `eng/vie/chi_sim`, OCR'd a rendered Vietnamese
  sample → exit 0, character-exact output ("Xin chào Việt Nam - Tôi yêu tiếng Việt").
- Caught a real defect: Alpine's `tesseract-ocr` does NOT bundle `eng`; since the
  route defaults to `vie+eng+chi_sim`, `eng` must be added explicitly.
- Handed the exact Dockerfile change to the docker-stack session (did NOT edit
  their Dockerfile — overwrite race avoidance).

## Files changed
- `.serena/memories/backlog/docker-stack-tesseract.md` (new — handoff w/ exact apk line)
- `.serena/memories/decisions/ocr-tesseract-docker.md` (new — rationale + verification + native fallback)
- `.serena/memories/INDEX.md` (pointers + POC status update)
- `.serena/checkpoint/claude-ocr-2026-06-04.md` (this)
- Test artifacts (outside repo, no git impact): `D:\tmp-laam-ocr\make-sample.ps1`, `sample-vi.png`, `expected.txt`

## Current state
- Docker OCR solution VERIFIED but NOT yet baked into the app image (that image
  doesn't exist yet — docker-stack worktree not created at time of writing).
- Host has no tesseract; host dev app (:3000) OCR returns 503 until app is containerized.
- Did NOT touch any Dockerfile/compose (left for docker session). :3000 dev server untouched.

## Next steps
- docker-stack session: fold `apk add --no-cache tesseract-ocr tesseract-ocr-data-eng
  tesseract-ocr-data-vie tesseract-ocr-data-chi_sim` into the runner stage (before
  `USER node`). After `laam-v2-app` is up: `docker exec laam-v2-app tesseract --list-langs`
  → expect chi_sim/eng/vie; then smoke `/api/ocr` from chat with a Vietnamese image.
- Optional cleanup: remove `D:\tmp-laam-ocr` once no longer needed.

## Blockers / Risks
- OCR only works once the app runs in the container. If the app must keep running
  on the host, native Windows install is needed (admin or portable PATH) — steps in
  decisions/ocr-tesseract-docker.md.
- Coordination: the apk line goes into a Dockerfile owned by the docker session;
  if they finalize before reading backlog, OCR will be missing — flagged in handoff.
