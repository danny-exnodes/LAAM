# Backlog — Chat E2E QA findings (Google connectors + write path)

**Source:** QA/QC leader live E2E on dev `:8443`, real Google account exnodes.vn, 2026-06-06.
**Full report:** `.serena/qa/e2e-chat-connectors-2026-06-06.md`.
**Verified good:** reads (gcal/gmail/gdrive list) return real data; write-gate confirm-card works end-to-end for `gmail_send` (confirm → real send, verified in Gmail). These are NOT bugs.

---

## F1 🔴 HIGH — Model confabulates WRITE success without calling the tool
**✅ RESOLVED (code) 2026-06-06** — branch `fix/f1-write-confabulation-guard` (not committed/merged), checkpoint `checkpoint/claude-chat-f1-2026-06-06.md`. Deterministic hard-block guard: in the main turn a write always suspends, so any unbacked "đã tạo/gửi thành công" claim is replaced with an honest message (`safety/write-claim-guard.ts`, vi/en/zh, TDD 15 cases) + system-prompt tool-forcing (`context.ts`). Reviewed (0 Critical; 2 Important + 2 Minor fixed). `npm test` 1075/1075, tsc clean. **Still needs user live-E2E** (real Ollama+Google) to confirm end-to-end. Good path (confirm-card) + reads + `gmail_send` confirm→execute untouched.

**Repro:** chat → "Tạo sự kiện Google Calendar tên 'LAAM QA test', bắt đầu 2026-06-07 15:00, kết thúc 15:30".
**Observed:** assistant replied *"Sự kiện 'LAAM QA test' đã được tạo thành công…"* but **no confirm-card appeared and NO event was created** (verified: Google Calendar search "LAAM QA test" → *No results*).
**Root cause:** the local model (qwen3-vl:8b) did **not emit a `gcal_create_event` tool_call** — it fabricated a success message. The write-gate (`withSafety`) only fires on an actual tool call, so there was nothing to gate. (Contrast: `gmail_send` in the SAME session DID emit the tool_call → confirm-card fired correctly. Tool-calling for writes is inconsistent.)
**Impact:** user is falsely told a write happened. Trust-critical.
**Fix directions (dev to choose):**
- Strengthen write-intent tool-forcing (system prompt / few-shot / `tool_choice`-style nudge) so write asks reliably emit a tool_call.
- Guard against unbacked success claims: if the assistant text asserts a completed write but no write tool_result exists this turn, suppress/flag it (don't render "đã tạo thành công").
- Consider a larger/more reliable tool-calling model for write intents.
- (Aligns with Rule 13 — never trust the model's prose over a real tool result.)

## F2 🟠 MED — Tool-trace + citation render inconsistently across turns
"Đã dùng N công cụ" + "Nguồn: …" appear on the FIRST turn and on the confirmed-write **resume** turn, but NOT on subsequent read turns (R5 gmail, R3 drive) in the same conversation — despite a tool running each time. Check SP-4 tool-event/citation rendering for non-first turns.

## F3 🟢 LOW — OAuth app could be "Internal" (account is Workspace, not personal Gmail)
Connected account = **exnodes.vn (Google Workspace)**, not personal Gmail. If all users are on the Workspace org, switch the Google OAuth app from **External+Testing → Internal**: removes the ~7-day refresh-token expiry AND the "unverified app" consent warning. Current External+Testing works but forces weekly reconnect. (See `decisions/connectors-oauth.md`.)

## Coverage gaps (not yet E2E-tested)
P4b new read tools (gcal_search_events, gcal_list_calendars, gmail_get_message, gdrive_get_file/export_text); drive write (gdrive_create_folder); write **Cancel ("Huỷ")** path; MCP client (no real server); github/trello/jira (not connected). Also: OCR composer note "OCR chưa sẵn sàng" = known backlog (tesseract not on host).

## Cleanup
Test email "LAAM QA test" left in exnodes.vn Inbox (self-sent, harmless). No calendar event was created.
