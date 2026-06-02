# LAAM logging proxy — a zero-dependency Node service that forwards requests to
# Ollama and writes JSONL logs that the LAAM dashboard reads.
#
# NOTE: the build context for this image is the ./proxy directory (see
# docker-compose.yml: `build: ./proxy`), so paths below are relative to ./proxy.
FROM node:20-alpine

WORKDIR /app

# The proxy has no npm dependencies (Node built-ins only). package.json is still
# copied because it declares "type":"module" — required for the ESM `import`
# syntax in server.js to work inside the image (no npm install needed).
COPY package.json server.js ./

# Run as the image's built-in unprivileged user.
USER node

ENV PROXY_PORT=11435 \
    OLLAMA_URL=http://ollama:11434 \
    LAAM_LOCAL_LOGS=/data/local-logs
EXPOSE 11435

CMD ["node", "server.js"]
