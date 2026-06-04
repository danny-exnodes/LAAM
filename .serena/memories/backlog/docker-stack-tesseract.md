# Backlog → session "docker-stack": bake Tesseract (vie OCR) into the app image

> Owner of the Dockerfile = the docker-stack session (worktree `LAAM-docker`,
> branch `infra/docker-stack`). This file is a **handoff**, not an edit — the
> OCR session (claude-ocr) verified the exact change but did NOT touch your
> Dockerfile to avoid an overwrite race. Please fold the line below in.

## Why
`src/app/api/ocr/route.ts` shells out to the system binary `tesseract`
(`execFile("tesseract", [img, "stdout", "-l", lang])`) with the **default
language `vie+eng+chi_sim`**. There is no JS OCR lib — so `tesseract` + the
three language data files MUST exist in the **app runtime image**. Without
them `/api/ocr` returns `503 "OCR chưa sẵn sàng: thiếu tesseract"`.

## The exact change (runner stage of the production Dockerfile)
The packages need root, so the `RUN apk add` must come **before `USER node`**.
Insert into the `runner` stage (the `FROM node:22-alpine AS runner` block):

```dockerfile
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# --- OCR: system tesseract + language data (vie/eng/chi_sim) for /api/ocr ---
# eng is NOT bundled with Alpine's tesseract-ocr package, and route.ts defaults
# to `-l vie+eng+chi_sim`, so eng must be listed explicitly or default OCR fails.
RUN apk add --no-cache \
      tesseract-ocr \
      tesseract-ocr-data-eng \
      tesseract-ocr-data-vie \
      tesseract-ocr-data-chi_sim

USER node
COPY --from=builder --chown=node:node /app/.next/standalone ./
# ...rest unchanged
```

Notes:
- Adds ~35-40 MB to the image (engine + 3 traineddata). Acceptable.
- Runs fine as non-root `node`: tessdata lands in world-readable
  `/usr/share/tessdata`; the route writes its temp image to `/tmp` (os.tmpdir).
- No code change needed — `tesseract` resolves on PATH inside the container.

## Verified (claude-ocr, 2026-06-04)
Ran the exact base + packages, OCR'd a rendered Vietnamese sample:
```
docker run --rm -v D:/tmp-laam-ocr:/data node:22-alpine sh -c '
  apk add --no-cache tesseract-ocr tesseract-ocr-data-eng tesseract-ocr-data-vie tesseract-ocr-data-chi_sim
  tesseract /data/sample-vi.png stdout -l vie+eng+chi_sim'
# → exit 0, output: "Xin chào Việt Nam - Tôi yêu tiếng Việt"  (diacritics correct)
```
`--list-langs` confirmed all three present. Test image generator:
`D:\tmp-laam-ocr\make-sample.ps1` (GDI+, Arial — regenerable).

## Post-merge verification (after app container is up)
Once `laam-v2-app` is running, prove OCR end-to-end inside the real image:
```powershell
docker exec laam-v2-app sh -c "tesseract --list-langs"   # expect chi_sim/eng/vie
```
(Or hit `/api/ocr` from the chat UI with a Vietnamese image once logged in.)
See decisions/ocr-tesseract-docker.md for full rationale + native fallback.
