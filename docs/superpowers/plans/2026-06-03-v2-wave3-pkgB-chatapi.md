# Wave 3 — Package W3-B (chat stream opts + OCR) — sub-plan

Owner: agent `chatapi`. Scope: MODIFY `v2/src/app/api/chat/route.ts`; CREATE `v2/src/app/api/ocr/route.ts` + matching `*.test.ts`. Surgical (Rule 3). No new deps.

## Task 1 — chat stream opts (MODIFY route.ts)
Extend POST body → `{ conversationId?, message, model?, temperature?, topP?, system? }`.

- [ ] Factor a PURE exported helper `buildOllamaPayload(body, historyMessages, defaults)` →
      `{ model, messages, options, stream: true }`.
      - `model` = `body.model` (non-empty string) else `defaults.model`.
      - system prompt = `body.system` (non-empty string) else `defaults.system`.
      - `messages` = `[{role:"system",content:system}, ...historyMessages]`.
      - `options` = `{ temperature, top_p }` only when provided (numbers); omit keys that are absent.
      - `historyMessages` = the `{role,content}[]` already built from DB rows (caller passes them).
- [ ] Use the resolved `model` for the Ollama call AND when persisting a NEW conversation
      (so chosen model is stored). Keep streaming loop + persistence + `x-conversation-id` intact.
- [ ] Success criteria (unit): temperature/top_p passthrough; system passthrough; model passthrough;
      defaults applied when omitted; options object omits absent keys.

## Task 2 — OCR endpoint (CREATE ocr/route.ts)
Port v1 `/api/ocr` (bin/laam.js ~590) to a Next route handler.

- [ ] `auth()` → 401 if no session.
- [ ] Validate base64 data-URL image (`data:image/<type>;base64,...`); 400 if invalid.
- [ ] tesseract availability via `execFile('tesseract',['--version'])`; 503 if unavailable.
- [ ] size guard ≤ 12MB → 413.
- [ ] write temp file (`node:os` tmpdir + `node:fs`), `execFile('tesseract',[tmp,'stdout','-l','vie+eng+chi_sim'],{timeout:45000})`,
      return `{ text }`; always unlink temp in finally; 500 on failure.
- [ ] Factor a pure `parseImageDataUrl(image)` helper for the data-URL validation (testable).
- [ ] Success criteria (unit/route): 401 no-auth; 503 missing-tesseract (mock); 400 invalid image; parse helper table.

## Verify
`cd v2 && npx vitest run src/app/api/chat src/app/api/ocr` green. Do NOT run full npm test.
Do NOT commit. Leave uncommitted for review.
