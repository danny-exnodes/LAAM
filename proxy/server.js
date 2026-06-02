'use strict';

/*
 * LAAM logging proxy for Ollama.
 *
 * Zero-dependency HTTP reverse proxy. Forwards every request to Ollama
 * unchanged and streams the response back to the client unchanged. For
 * completion endpoints it additionally tees the response stream so it can
 * extract assistant text + token counts and append a structured JSONL log
 * line that LAAM reads.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { URL } from 'node:url';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PROXY_PORT = parseInt(process.env.PROXY_PORT || '11435', 10);
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const LAAM_LOCAL_LOGS =
  process.env.LAAM_LOCAL_LOGS || path.join(os.homedir(), '.laam', 'local-logs');
// Optional: model name to inject when a completion request omits `model`.
// Lets you switch the default between e.g. qwen2.5-coder:7b and :14b without
// touching the client. Empty = never inject (client must specify the model).
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || '';

const UPSTREAM = new URL(OLLAMA_URL);

// Endpoints whose bodies we capture for logging.
const COMPLETION_ENDPOINTS = new Set([
  '/v1/chat/completions',
  '/v1/completions',
  '/api/chat',
  '/api/generate',
]);

const MAX_CONTENT_CHARS = 4000;
const MAX_RESPONSE_CHARS = 8000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureLogDir() {
  try {
    fs.mkdirSync(LAAM_LOCAL_LOGS, { recursive: true });
  } catch (err) {
    console.error('[proxy] failed to create log dir:', err && err.message);
  }
}

function utcDate() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function sanitizeSessionId(id) {
  return String(id).replace(/[^A-Za-z0-9._-]/g, '-');
}

function headerLookup(headers, name) {
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) return headers[key];
  }
  return undefined;
}

function truncate(str, max) {
  if (typeof str !== 'string') return str;
  return str.length > max ? str.slice(0, max) : str;
}

function safeJsonParse(buf) {
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch (_) {
    return null;
  }
}

// Build the trimmed `request` object for the log line.
function buildRequestSummary(endpoint, reqJson) {
  if (!reqJson || typeof reqJson !== 'object') return {};

  // Chat-style endpoints carry a messages array.
  if (Array.isArray(reqJson.messages)) {
    return {
      messages: reqJson.messages.map((m) => {
        const c = m && m.content;
        let content;
        if (c === undefined || c === null) content = '';
        else if (typeof c === 'string') content = c;
        else content = JSON.stringify(c);
        return {
          role: m && m.role,
          content: truncate(content, MAX_CONTENT_CHARS),
        };
      }),
    };
  }

  // generate / completions carry a prompt string.
  if (reqJson.prompt !== undefined) {
    const prompt =
      typeof reqJson.prompt === 'string'
        ? reqJson.prompt
        : JSON.stringify(reqJson.prompt);
    return { prompt: truncate(prompt, MAX_CONTENT_CHARS) };
  }

  return {};
}

// Extract assistant text + token counts from a fully buffered upstream body.
// Returns { responseText, tokensIn, tokensOut }.
function parseResponseBody(endpoint, stream, bodyBuf) {
  const result = { responseText: '', tokensIn: 0, tokensOut: 0 };
  const body = bodyBuf.toString('utf8');
  const isOpenAI = endpoint.startsWith('/v1/');

  if (!stream) {
    const json = safeJsonParse(bodyBuf);
    if (!json) return result;
    if (isOpenAI) {
      const choice = json.choices && json.choices[0];
      if (choice) {
        if (choice.message && typeof choice.message.content === 'string') {
          result.responseText = choice.message.content;
        } else if (typeof choice.text === 'string') {
          result.responseText = choice.text;
        }
      }
      if (json.usage) {
        result.tokensIn = json.usage.prompt_tokens || 0;
        result.tokensOut = json.usage.completion_tokens || 0;
      }
    } else {
      // Native Ollama non-streaming.
      if (json.message && typeof json.message.content === 'string') {
        result.responseText = json.message.content;
      } else if (typeof json.response === 'string') {
        result.responseText = json.response;
      }
      result.tokensIn = json.prompt_eval_count || 0;
      result.tokensOut = json.eval_count || 0;
    }
    return result;
  }

  // Streaming.
  if (isOpenAI) {
    // SSE: lines beginning with "data: ".
    let text = '';
    const lines = body.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '' || payload === '[DONE]') continue;
      const json = safeJsonParse(Buffer.from(payload));
      if (!json) continue;
      const choice = json.choices && json.choices[0];
      if (choice) {
        if (choice.delta && typeof choice.delta.content === 'string') {
          text += choice.delta.content;
        } else if (typeof choice.text === 'string') {
          text += choice.text;
        }
      }
      if (json.usage) {
        result.tokensIn = json.usage.prompt_tokens || result.tokensIn;
        result.tokensOut = json.usage.completion_tokens || result.tokensOut;
      }
    }
    result.responseText = text;
  } else {
    // Native Ollama: newline-delimited JSON objects.
    let text = '';
    const lines = body.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const json = safeJsonParse(Buffer.from(trimmed));
      if (!json) continue;
      if (json.message && typeof json.message.content === 'string') {
        text += json.message.content;
      } else if (typeof json.response === 'string') {
        text += json.response;
      }
      if (json.done) {
        result.tokensIn = json.prompt_eval_count || result.tokensIn;
        result.tokensOut = json.eval_count || result.tokensOut;
      }
    }
    result.responseText = text;
  }

  return result;
}

function writeLog(entry) {
  try {
    const sessionId = entry.sessionId;
    const file = path.join(LAAM_LOCAL_LOGS, `${sessionId}.jsonl`);
    fs.appendFileSync(file, JSON.stringify(entry) + '\n');
  } catch (err) {
    // Best-effort: never crash or affect the client.
    console.error('[proxy] failed to write log:', err && err.message);
  }
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = http.createServer((clientReq, clientRes) => {
  const ts = Date.now();
  const endpoint = clientReq.url.split('?')[0];
  const isCompletion =
    clientReq.method === 'POST' && COMPLETION_ENDPOINTS.has(endpoint);

  // Session id.
  const rawSession = headerLookup(clientReq.headers, 'x-laam-session');
  const sessionId = sanitizeSessionId(
    rawSession && String(rawSession).trim()
      ? rawSession
      : `local-${utcDate()}`
  );

  // Buffer the request body (always, so we can forward it; for completion
  // endpoints we also parse it for logging).
  const reqChunks = [];
  clientReq.on('data', (chunk) => reqChunks.push(chunk));
  clientReq.on('error', () => {
    /* client aborted; nothing to forward */
  });

  clientReq.on('end', () => {
    let reqBody = Buffer.concat(reqChunks);
    let reqJson = null;
    let model = '';
    let streamFlag = false;

    if (isCompletion) {
      reqJson = safeJsonParse(reqBody);
      if (reqJson && typeof reqJson === 'object') {
        // Inject the default model when the client didn't specify one.
        if (DEFAULT_MODEL && !reqJson.model) {
          reqJson.model = DEFAULT_MODEL;
          reqBody = Buffer.from(JSON.stringify(reqJson), 'utf8');
        }
        model = typeof reqJson.model === 'string' ? reqJson.model : '';
        // /api/* defaults to streaming when `stream` is omitted; /v1/* defaults
        // to non-streaming.
        if (typeof reqJson.stream === 'boolean') {
          streamFlag = reqJson.stream;
        } else {
          streamFlag = endpoint.startsWith('/api/');
        }
      }
    }

    // Forward headers, dropping hop-by-hop / length headers we recompute.
    const fwdHeaders = Object.assign({}, clientReq.headers);
    delete fwdHeaders['content-length'];
    // Point Host at upstream.
    fwdHeaders.host = UPSTREAM.host;

    const upstreamOptions = {
      protocol: UPSTREAM.protocol,
      hostname: UPSTREAM.hostname,
      port: UPSTREAM.port || (UPSTREAM.protocol === 'https:' ? 443 : 80),
      method: clientReq.method,
      path: clientReq.url,
      headers: fwdHeaders,
    };

    const upstreamReq = http.request(upstreamOptions, (upstreamRes) => {
      // Mirror status + headers back to client transparently.
      clientRes.writeHead(upstreamRes.statusCode, upstreamRes.headers);

      const respChunks = [];
      upstreamRes.on('data', (chunk) => {
        // Tee: write to client AND buffer for logging (completion only).
        clientRes.write(chunk);
        if (isCompletion) respChunks.push(chunk);
      });
      upstreamRes.on('end', () => {
        clientRes.end();
        if (!isCompletion) return;

        const endTs = Date.now();
        let parsed = { responseText: '', tokensIn: 0, tokensOut: 0 };
        try {
          parsed = parseResponseBody(
            endpoint,
            streamFlag,
            Buffer.concat(respChunks)
          );
        } catch (_) {
          /* best-effort */
        }

        const httpStatus = upstreamRes.statusCode || 0;
        const entry = {
          ts,
          endTs,
          durationMs: endTs - ts,
          sessionId,
          model,
          endpoint,
          stream: streamFlag,
          status: httpStatus >= 200 && httpStatus < 400 ? 'ok' : 'error',
          httpStatus,
          tokensIn: parsed.tokensIn || 0,
          tokensOut: parsed.tokensOut || 0,
          request: buildRequestSummary(endpoint, reqJson),
          responseText: truncate(parsed.responseText || '', MAX_RESPONSE_CHARS),
          error: null,
        };
        writeLog(entry);
        console.log(
          `[proxy] ${model || '?'} ${endpoint} in=${entry.tokensIn} out=${entry.tokensOut} ${entry.durationMs}ms`
        );
      });
      upstreamRes.on('error', () => {
        try {
          clientRes.end();
        } catch (_) {}
      });
    });

    upstreamReq.on('error', (err) => {
      const endTs = Date.now();
      const message = (err && err.message) || 'upstream error';
      // Respond 502 to client if headers not yet sent.
      try {
        if (!clientRes.headersSent) {
          clientRes.writeHead(502, { 'content-type': 'application/json' });
        }
        clientRes.end(
          JSON.stringify({ error: { message, type: 'proxy_upstream_error' } })
        );
      } catch (_) {}

      if (isCompletion) {
        writeLog({
          ts,
          endTs,
          durationMs: endTs - ts,
          sessionId,
          model,
          endpoint,
          stream: streamFlag,
          status: 'error',
          httpStatus: 502,
          tokensIn: 0,
          tokensOut: 0,
          request: buildRequestSummary(endpoint, reqJson),
          responseText: '',
          error: message,
        });
        console.log(
          `[proxy] ${model || '?'} ${endpoint} ERROR ${message} ${endTs - ts}ms`
        );
      }
    });

    // Forward the buffered request body.
    if (reqBody.length) upstreamReq.write(reqBody);
    upstreamReq.end();
  });
});

ensureLogDir();
server.listen(PROXY_PORT, () => {
  console.log(
    `[proxy] listening on :${PROXY_PORT} -> ${OLLAMA_URL} | logs: ${LAAM_LOCAL_LOGS}`
  );
});
