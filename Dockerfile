# syntax=docker/dockerfile:1

# ---- deps: install full dependencies for the build ----
# node:24-alpine (Active LTS) — keep in sync with the dev host's Node/npm major
# (npm 10 vs 11 write different lockfile dialects → recurring @emnapi npm ci breakage).
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: production build → .next/standalone ----
FROM node:24-alpine AS builder
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
# Standalone omits public/ and .next/static/ by design — copy them in.
# .next/static always exists after build; public/ is optional (this app has
# none today), so guard it to keep the build resilient if it's added later.
RUN cp -r .next/static .next/standalone/.next/static \
 && if [ -d public ]; then cp -r public .next/standalone/public; fi

# ---- runner: minimal production image ----
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# --- PDF + OCR: poppler-utils (pdftotext/pdftoppm) + system tesseract + language
# data. /api/pdf parses PDFs server-side (poppler) so it works on every client
# device (no browser pdfjs); /api/ocr + the PDF scan tier use tesseract. Needs
# root, so it runs BEFORE `USER node`. eng is NOT bundled with Alpine's
# tesseract-ocr package, and the routes default to `-l vie+eng+chi_sim`, so eng
# must be listed explicitly or every default OCR call fails.
RUN apk add --no-cache \
      poppler-utils \
      unzip \
      tesseract-ocr \
      tesseract-ocr-data-eng \
      tesseract-ocr-data-vie \
      tesseract-ocr-data-chi_sim
# Run as the built-in non-root user.
USER node
COPY --from=builder --chown=node:node /app/.next/standalone ./
EXPOSE 3000
# Node has global fetch; /login is public (no auth) → 200 when healthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
