# LAAM — Local AI Agent Monitoring (web dashboard)
# Multi-purpose Node image serving the dashboard on port 4317.
FROM node:20-alpine

# wget is part of busybox in alpine; used by the HEALTHCHECK below.
WORKDIR /app

# Install production dependencies first so this layer is cached unless the
# manifest or lockfile change.
# Copy the lockfile too (a glob keeps the build working even if it's absent —
# in that case `npm ci` would fail, so fall back to `npm install`).
COPY package.json package-lock.json* ./
# Prefer a reproducible install from the lockfile. If you ever build without a
# package-lock.json, swap this for: RUN npm install --omit=dev
RUN npm ci --omit=dev

# Copy the rest of the application source. node_modules, proxy/, .git, etc. are
# excluded via .dockerignore so they don't bloat the image or clobber the
# freshly-installed production deps above.
COPY . .

# The node:* images ship with an unprivileged "node" user (uid 1000). Run as it.
USER node

# Server configuration (overridable at runtime / via docker-compose).
ENV LAAM_PORT=4317
EXPOSE 4317

# Liveness probe: hit the app's own health endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:4317/api/health || exit 1

CMD ["node", "bin/laam.js"]
