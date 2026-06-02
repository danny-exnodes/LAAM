# LAAM Ollama Logging Proxy

A zero-dependency Node.js reverse proxy that sits in front of [Ollama]. It
forwards every request to Ollama unchanged and streams the response back to the
client byte-for-byte, while recording a structured JSONL log line for each
completion request so LAAM can display local-model activity.

Only Node.js built-in modules are used (`node:http`, `node:fs`, `node:path`,
`node:os`, `node:url`) — no `npm install`, trivial to Dockerize.

## What it does

- **Transparent passthrough for all paths.** Any request (`/api/tags`,
  `/api/pull`, `/api/show`, etc.) is forwarded to Ollama with its method, path,
  headers, and body intact, and the upstream status/headers/body — including
  streamed/chunked bodies — are piped straight back to the client.
- **Logging for completion endpoints.** For the endpoints below, the proxy
  *tees* the response: it streams bytes to the client as they arrive **and**
  accumulates them to extract the assistant text and token counts, then appends
  one log line. Logging is best-effort and never affects the client response.
  - OpenAI-compatible: `POST /v1/chat/completions`, `POST /v1/completions`
  - Native Ollama: `POST /api/chat`, `POST /api/generate`
  - Both streaming and non-streaming responses are supported.
- **Upstream errors** return `502` with a JSON error body to the client and are
  recorded as a log line with `status: "error"`.

## Configuration (environment variables)

| Variable           | Default                              | Description                                    |
| ------------------ | ------------------------------------ | ---------------------------------------------- |
| `PROXY_PORT`       | `11435`                              | Port the proxy listens on.                     |
| `OLLAMA_URL`       | `http://localhost:11434`             | Upstream Ollama base URL.                      |
| `LAAM_LOCAL_LOGS`  | `<homedir>/.laam/local-logs`         | Directory for JSONL logs (created if missing). |

## Running

```sh
node proxy/server.js
# or with overrides:
PROXY_PORT=11435 OLLAMA_URL=http://localhost:11434 node proxy/server.js
```

On startup it logs the listen port, upstream URL, and log directory. Each logged
completion also prints:

```
[proxy] <model> <endpoint> in=<tokensIn> out=<tokensOut> <durationMs>ms
```

## Pointing a client at the proxy

Instead of talking to Ollama directly, point your client's base URL at the
proxy.

- **OpenAI-compatible SDKs:** set `base_url` to `http://localhost:11435/v1`
  (e.g. the OpenAI Python/JS client, or any tool that accepts an OpenAI base
  URL). The API key can be any non-empty placeholder.
- **Ollama clients / CLI:** set the Ollama host to `http://localhost:11435`
  (e.g. `OLLAMA_HOST=http://localhost:11435`).

### Session header

Send an `x-laam-session` request header (case-insensitive) to group requests
into a named session; its value is sanitized to a safe filename (characters
outside `[A-Za-z0-9._-]` become `-`). If the header is absent, requests are
logged to the default session `local-YYYY-MM-DD` (UTC date).

```sh
curl -H 'x-laam-session: my-session' http://localhost:11435/api/chat -d '{...}'
```

## Log format

Logs are written as [JSON Lines]: one JSON object per line, appended to
`<LAAM_LOCAL_LOGS>/<sessionId>.jsonl`. Each line has exactly this shape (this is
a hard contract LAAM reads):

```jsonc
{
  "ts": 1780383876976,          // ms epoch when the request was received
  "endTs": 1780383876978,       // ms epoch when the response finished
  "durationMs": 2,              // endTs - ts
  "sessionId": "my-session",
  "model": "qwen2.5-coder:7b",  // from request body .model
  "endpoint": "/api/chat",      // e.g. "/v1/chat/completions"
  "stream": false,
  "status": "ok",               // "ok" | "error"
  "httpStatus": 200,            // upstream status code (502 on upstream failure)
  "tokensIn": 7,                // prompt tokens (0 if unknown)
  "tokensOut": 2,               // completion tokens (0 if unknown)
  "request": {                  // trimmed request summary
    "messages": [{ "role": "user", "content": "hi" }]
    // or { "prompt": "..." } for generate/completions
  },
  "responseText": "Hello world", // assembled assistant text (truncated ~8000 chars)
  "error": null                  // error message string, or null
}
```

### Token counts

- **Non-streaming OpenAI:** `usage.prompt_tokens` / `usage.completion_tokens`.
- **Streaming OpenAI:** token counts come from a chunk carrying `usage`
  (requires `stream_options: { include_usage: true }`); otherwise they remain
  `0` (best-effort — not estimated).
- **Ollama (`/api/chat`, `/api/generate`):** `prompt_eval_count` (in) and
  `eval_count` (out), read from the final `"done": true` object when streaming.

Content strings in `request` are truncated to ~4000 chars and `responseText` to
~8000 chars.

[Ollama]: https://ollama.com
[JSON Lines]: https://jsonlines.org
