# Decision: Tesseract OCR via Docker (bake into app image), not native Windows

**Date:** 2026-06-04 · **Author:** claude-ocr session

## Context
LAAM's `/api/ocr` (`src/app/api/ocr/route.ts`) calls the **system `tesseract`
binary** via `execFile`, default lang `vie+eng+chi_sim`. The host (this Windows
machine) has no tesseract; `winget` is UAC-blocked when run non-interactively,
so native auto-install is impractical. The app is being containerized
(`node:22-alpine` standalone) by the docker-stack session.

## Decision
**Install tesseract + language data inside the app's runtime image**, not on the
Windows host. OCR then runs in-container and the admin/UAC problem disappears.

Packages (Alpine, runner stage, as root before `USER node`):
```
apk add --no-cache tesseract-ocr tesseract-ocr-data-eng tesseract-ocr-data-vie tesseract-ocr-data-chi_sim
```

## Key findings
- **`eng` is NOT bundled** with Alpine's `tesseract-ocr` package. Since
  route.ts defaults to `vie+eng+chi_sim`, `eng` must be added explicitly or
  every default OCR call fails with "Error opening data file eng.traineddata".
  (Caught only because we tested the full default lang string, not just `-l vie`.)
- tesseract 5.5.1 on Alpine; Vietnamese accuracy on clean rendered text was
  exact. Adds ~35-40 MB to the image.
- Works as non-root `node`: tessdata is world-readable; temp images go to `/tmp`.
- **Cannot** be a separate compose service: OCR is invoked in-process by the
  Next server via `execFile`, so the binary must live in the app container.

## Verification (evidence)
`node:22-alpine` + the 4 packages, OCR of a rendered Vietnamese PNG
("Xin chào Việt Nam - Tôi yêu tiếng Việt") with `-l vie+eng+chi_sim`:
exit 0, output character-exact (diacritics preserved). `--list-langs` →
chi_sim/eng/vie. Image generator: `D:\tmp-laam-ocr\make-sample.ps1`.

## Handoff
Exact Dockerfile insertion handed to the docker-stack session in
`backlog/docker-stack-tesseract.md` (they own the Dockerfile — not edited here
to avoid an overwrite race with their in-flight worktree).

## Native Windows fallback (only if app stays on the host, not containerized)
The host dev app (`npm run dev` :3000) has no tesseract until it runs in the
container. If OCR is needed on the host before then:
- **With admin (PowerShell as Administrator):**
  `winget install --id UB-Mannheim.TesseractOCR -e` (interactive UAC), then add
  the install dir (e.g. `C:\Program Files\Tesseract-OCR`) to PATH, and drop
  `vie.traineddata` + `chi_sim.traineddata` into its `tessdata\` folder
  (UB-Mannheim build ships many langs; pick Vietnamese during setup).
- **Without admin:** download the portable UB-Mannheim zip, extract to a user
  dir, add that dir to the **user** PATH (no admin needed), ensure `vie`/`eng`/
  `chi_sim` traineddata are in its `tessdata\`. `tesseract --version` must
  resolve for route.ts to find it.
The Docker path is preferred and is the verified solution.
