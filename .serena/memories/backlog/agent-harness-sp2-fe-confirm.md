# Backlog/Handoff: SP-2 → session FE responsive — Confirm-write UI

**Từ:** orchestrator SP-2 · **Tới:** session FE (sở hữu `src/components/chat/*`) · **Ngày:** 2026-06-05
**Nguồn chân lý:** spec `docs/superpowers/specs/2026-06-04-agent-harness-sp2-actions-safety-design.md` §7.
**Trạng thái:** chờ FE nhận. SP-2 **không** tự sửa `components/chat/*` (chỉ giao wire contract). Backend gate hoạt động end-to-end **ngay khi** FE thêm card.

## Bối cảnh
SP-2 gate hành động **write** (vd `trello_create_card`): khi model đề xuất write, `/api/chat` **không** chạy ngay mà kết thúc turn bằng **text đề xuất + frame `pending_write`**. User bấm Xác nhận → POST lại → backend execute + stream kết quả.

## Điểm chạm (đọc trước, ghi chú, đừng rewrite cái đang có)
1. **`ChatClient.tsx` (~171-200, hàm `streamReply`)** — hiện strip 1 frame U+001E `{i,o}` token-usage. Cần mở rộng thành **router theo khoá `t`**:
   - `t:"tokens"` → như cũ (lưu ý: frame cũ `{i,o}` sẽ migrate thành `{t:"tokens",i,o}` — **phối hợp SP-4**, bên đó sở hữu schema frame chung `{t:"tokens"|"pending_write"|"tool_event"}`).
   - `t:"pending_write"` → set state `pendingWrite = {token, tool, title, summary, fields}`; **không** coi phần này là text hiển thị.
   - ⚠️ **Prerequisite:** frame-router chung là việc SP-4. Đồng bộ thứ tự với SP-4 trước khi code.
2. **Component mới (FE sở hữu, đặt tên tuỳ FE)** — card xác nhận:
   - Hiện `title`, `summary`, danh sách `fields[{label,value}]` (đã redact sẵn từ backend — **không** tự suy ra từ text).
   - 2 nút: **Xác nhận** / **Huỷ**. Disable khi đang gửi.
   - Bấm → `POST /api/chat` body `{ confirm: { token, approve: true|false }, conversationId }` → **stream tiếp** vào một message assistant mới (tái dùng `streamReply` đã có, chỉ đổi body).
   - Trạng thái: idle → đang chạy → đã tạo/đã huỷ/lỗi.
3. **i18n (vi/en/zh)** — thêm keys: tiêu đề card, nút Xác nhận/Huỷ, các trạng thái. (Theo [[responsive-conventions]] + cơ chế i18n hiện có.)

## Wire contract (cố định từ backend SP-2)
- **Frame** (cuối stream, sau ký tự U+001E): `{ t:"pending_write", token, tool, title, summary, fields:[{label,value}] }`. `token` mờ (đã mã hoá) — chỉ echo lại, không parse.
- **Confirm request:** `POST /api/chat` với `{ confirm:{ token, approve }, conversationId? }` (union body — KHÔNG thêm endpoint mới).
- **Deny** (`approve:false`): backend trả text "Đã huỷ", không execute.
- Token có TTL ~5'; hết hạn/hỏng → backend trả text lỗi thân thiện (FE chỉ hiển thị).

## Không thuộc phạm vi FE
Ký/giải token, execute, redact, audit, dedupe — **backend** lo hết. FE chỉ render + round-trip `token`.
