# QA E2E — Chat + Google connectors + new tool surface (2026-06-06)

**Role:** QA/QC leader · **Method:** drove the LIVE app `https://danny-gaming-pc.tail41dda4.ts.net:8443/chat` via Claude-in-Chrome (Browser 2, Windows local), real connected Google account **exnodes.vn** (Workspace). Side-effects verified DIRECTLY in Google Calendar + Gmail (not trusting the model's claims — Rule 13).

**Overall verdict:** Reads ✅ · Write-gate ✅ (gmail, full confirm→execute→verified) · **1 FAIL** = local model confabulates write success without calling the tool (calendar).

## Steps (against the running app)
| # | Scenario | Tool | Result |
|---|---|---|---|
| R1 | "liệt kê sự kiện Calendar" | `gcal_list_events` | ✅ real data ("Happy birthday" recurring 2026→2040) + trace + citation "Nguồn: gcal list events" |
| R5 | "3 email gần đây Gmail" | `gmail_list_messages` | ✅ 3 real messages (subject/from/date) |
| R3 | "file gần đây Drive" | `gdrive_list_files` | ✅ 4 real files (.docx/.pptx/.xlsx/.pdf) |
| W1 | "tạo sự kiện Calendar 'LAAM QA test' 2026-06-07 15:00" | `gcal_create_event` | ❌ model said "đã tạo thành công" but **NO confirm-card, NO event** — Google Calendar search "LAAM QA test" = **No results**. Model confabulated; did not call the tool. |
| W2 | "gửi email 'LAAM QA test' tới self" | `gmail_send` | ✅ **confirm-card fired** ("Hành động ghi" + to/subject/body + Xác nhận/Huỷ) → clicked Xác nhận → "Đã gửi email thành công ID 19e9ca48b9256d83" → **verified in Gmail: email in Inbox 6:14 PM**. Full write-gate E2E PASS. |

## Findings
- 🔴 **W1 — write confabulation (model reliability).** For the calendar-create intent the local model (qwen3-vl:8b) returned a fabricated "created successfully" message **without emitting a tool_call** → no event created, user falsely told it succeeded. The write-gate is NOT at fault (W2 proves it works); the model is inconsistent at invoking write tools. **High-impact trust bug.** Mitigations to consider: stronger tool-forcing/system-prompt for write intents; post-hoc verification; a different/larger model for tool-calling; or never present a "success" message that isn't backed by a tool result.
- ✅ **Write-gate sound.** `gmail_send` → `PendingWriteSignal` → confirm-card with exact args → Xác nhận → real send. Args passed correctly. (Cancel/"Huỷ" path not exercised.)
- 🔍 **Tool-trace/citation inconsistent.** "Đã dùng N công cụ" + "Nguồn:" shown on R1 (first turn) and the W2 resume, but NOT on R5/R3 (subsequent read turns). Worth checking the SP-4 tool-event/citation rendering across turns.
- ⚠️ **Connected account is Workspace (exnodes.vn), not personal Gmail.** OAuth app is currently External+Testing (chosen for personal-Gmail assumption). A Workspace org could use an **Internal** app → no 7-day refresh expiry, no unverified-app warning. Revisit if all users are on the Workspace.
- 🔍 `OCR chưa sẵn sàng trên máy chủ` shown at composer (known backlog — tesseract not on host).
- Proactive alert card fired ("agent kẹt … phút / chi phí $5.84") — SP-3 proactive working. Token "miễn phí (local)" ✓.

## NOT covered (coverage gaps)
- New P4b read tools (gcal_search_events, gcal_list_calendars, gmail_get_message, gdrive_get_file/export_text) — only base list tools tested.
- Drive write (`gdrive_create_folder`) — user authorized mail+calendar only.
- Write Cancel ("Huỷ") path.
- MCP client (no real MCP server connected).
- github/trello/jira connectors (not connected).

## Artifacts to clean
- Test email "LAAM QA test" sits in the exnodes.vn Inbox (self-sent). Harmless; user can delete. (No calendar event was created.)
