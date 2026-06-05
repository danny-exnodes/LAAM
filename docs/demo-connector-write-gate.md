# Demo: Connector Write-Gate (Confirm Card) — end-to-end, no credentials

This is the QA/demo script for the SP-2 write-gate + SP-4 tool-trace flow that the
2026-06-05 chat QA could not exercise (no connector was configured). It uses the
built-in **Demo connector** (`src/lib/connectors/demo.ts`), which needs **no API
keys**, so the whole flow runs offline.

## What it proves

`prompt → model proposes a write → gate suspends the turn → Confirm Card →
user confirms → write executes → tool-trace ✓` (and `cancel → "Đã huỷ"`).

The write tool is `demo_create_task`. It is classified as a **write** in
`src/lib/agent/safety/policy.ts` (`CONNECTOR_WRITES`), so the safety gate
(`withSafety`) suspends it until confirmed — exactly like `trello_create_card`,
but with no external service.

## Steps

1. **Enable the Demo connector** (one click, no credentials):
   - Go to `/connectors`, find **Demo (dữ liệu mẫu)**, click **Connect/Kết nối**.
   - It has `auth.type: "none"`; connecting just sets `_connected: true` for your user.
2. **Open `/chat`** and send a prompt that asks to create a task, e.g.:
   - vi: `Tạo công việc "Chuẩn bị họp khách hàng" trạng thái doing`
   - en: `Create a task "Prep client meeting" with status doing`
3. The model calls `demo_create_task`. The gate suspends the turn and streams a
   `pending_write` frame → a **Confirm Card** renders on the assistant message
   (title "Tạo công việc (demo)", fields built by code — `buildPreview`, Rule 13).
4. **Confirm** → the turn resumes (`/api/chat {confirm}`), `demo_create_task`
   executes, and the reply narrates the created task. A tool-trace chip (✓) shows
   the tool ran.
   **Cancel** → the card shows "Đã huỷ" and nothing is written.

## How it’s wired (for maintainers)

| Piece | File |
|---|---|
| Write tool + handler | `src/lib/connectors/demo.ts` (`demo_create_task`) |
| Write classification | `src/lib/agent/safety/policy.ts` (`CONNECTOR_WRITES`) |
| Confirm-card preview (code-derived) | `src/lib/agent/safety/preview.ts` (`demo_create_task` case) |
| Gate suspend / resume | `src/lib/agent/safety/{gate,resume,token}.ts` |
| Frame → card | `src/lib/chat/frames.ts` (`pending_write`) · `src/components/chat/ConfirmCard.tsx` |

## Swapping in a real connector (Trello)

The same flow works with `trello_create_card` once a Trello connector is
configured at `/connectors` (needs `key` + `token`). The Demo connector exists so
the write-gate can be verified without any third-party account.
