# FE Confirm-Card — Agent Harness (deep-dive spec)

> **Hoàn thiện** UI xác nhận hành động write của SP-2 (write-gate). Backend đã xong end-to-end; đây là mảnh FE còn thiếu để luồng write **dùng được trên trình duyệt**.
> **Ngày:** 2026-06-05 · **Chủ đề:** session FE (sở hữu `src/components/chat/*`) · **Trạng thái:** chờ FE pick.
> Nguồn chân lý: SP-2 spec `2026-06-04-agent-harness-sp2-actions-safety-design.md` §7 · handoff `backlog/agent-harness-sp2-fe-confirm.md` · SP-4 frame router (đã merge).

---

## 1. Mục tiêu & phạm vi
**Mục tiêu:** khi model đề xuất một hành động **write** (vd `trello_create_card`), `/api/chat` kết thúc turn bằng *text đề xuất + frame `pending_write`*. FE phải **render một confirm-card** (title/summary/fields + nút Xác nhận/Huỷ); bấm → `POST /api/chat {confirm}` → stream kết quả vào message mới.

**Trong phạm vi (FE only):** route frame `pending_write` → state; component card; round-trip confirm/deny; trạng thái card; i18n chrome (vi/en/zh); test.
**Ngoài phạm vi (backend đã lo):** ký/giải `token`, execute, redact, audit, dedupe, TTL. FE **chỉ echo `token`**, không parse.

## 2. Hiện trạng (đã verify trên main)
- `src/lib/chat/frames.ts`: `ChatFrame` **đã có** `{t:"pending_write",token,tool,title,summary,fields?}`; `splitFrames` strip frame khỏi text.
- `ChatClient.tsx`: SP-4 đã thay strip thủ công bằng `splitFrames`; `applyFrames` xử lý `t:"tokens"|"tool"|"cite"` — **CHƯA có `t:"pending_write"`** ⇒ frame hiện bị strip & bỏ qua (không card).
- `ChatMsg` (types.ts) có `toolTrace?`/`cites?` (ephemeral). Thêm `pendingWrite?` cùng kiểu.

## 3. Wire contract (cố định — KHÔNG đổi)
- **Frame** cuối stream: `{ t:"pending_write", token:string, tool:string, title:string, summary:string, fields?:{label,value}[] }`. `title/summary/fields` đã redact + code-built ở backend → **hiển thị as-is** (không tự suy từ text).
- **Confirm:** `POST /api/chat` body `{ confirm:{ token, approve:boolean }, conversationId? }` (union body — KHÔNG thêm endpoint). Response = **stream text** như mọi lượt (approve→kết quả; deny→"Đã huỷ"; token hỏng/hết hạn→text lỗi thân thiện).

## 4. Thiết kế
### 4.1 State (additive)
- `chat/types.ts`: `ChatMsg += { pendingWrite?: PendingWrite }` với
  `type PendingWrite = { token:string; tool:string; title:string; summary:string; fields?:{label:string;value:string}[]; status:"idle"|"sending"|"done"|"cancelled"|"error" }` (`status` mặc định `"idle"`).
- **Ephemeral** (như toolTrace/cites) — reload không giữ. 1 write/turn (SP-2 gate) ⇒ tối đa 1 card active (gắn message assistant đề xuất).

### 4.2 Route frame → state (`ChatClient.applyFrames`)
Thêm nhánh: `else if (f.t === "pending_write") pendingWrite = { token:f.token, tool:f.tool, title:f.title, summary:f.summary, fields:f.fields, status:"idle" };` rồi truyền vào `setLastAssistant(...)` (thêm 1 param optional, song song `cites`). **KHÔNG** đưa frame này vào text hiển thị (splitFrames đã strip).

### 4.3 Component `ConfirmCard.tsx` (mới — FE sở hữu, style theo [[responsive-conventions]])
- Props: `{ pending: PendingWrite; onConfirm(approve:boolean):void }`.
- Render: `title` (đậm) · `summary` · bảng `fields[{label,value}]` · 2 nút **Xác nhận**/**Huỷ**.
- `status`: `idle`→2 nút bật · `sending`→disable + spinner · `done`/`cancelled`/`error`→ẩn nút, hiện badge trạng thái (i18n). **`null` nếu `msg.pendingWrite` undefined** (bong bóng thường không đổi).
- Đặt **dưới** text đề xuất trong nhánh assistant của `MessageItem.tsx` (slot additive, giống ToolTrace/Citations).

### 4.4 Round-trip (tái dùng stream helper sẵn có)
- `onConfirm(approve)`: set `status:"sending"` → gọi **đúng helper POST+stream hiện tại** (`streamReply`/tương đương) nhưng **body = `{ confirm:{token,approve}, conversationId }`** thay vì `{message}` → tạo **message assistant MỚI** stream kết quả vào đó.
- Khi stream xong: set card cũ `status = approve ? "done" : "cancelled"`; lỗi mạng/`!res.ok` → `status:"error"` (vẫn hiện text lỗi backend nếu có).
- **Chống double-submit:** nút disable khi `sending`/đã resolved (backend cũng dedupe nonce, nhưng UI phải chặn trước).

### 4.5 i18n (vi/en/zh) — chỉ **chrome**, không phải title/summary (backend cấp)
Keys: `chat.confirmAction` (nhãn vùng, nếu cần), `chat.confirm` (Xác nhận), `chat.cancel` (Huỷ), `chat.confirmSending`, `chat.confirmDone`, `chat.confirmCancelled`, `chat.confirmError`. (title/summary/fields localize là việc backend tương lai — ngoài phạm vi.)

### 4.6 Edge cases
- **Deny:** POST `approve:false` → backend "Đã huỷ" → message mới; card `cancelled`.
- **Token hết hạn/hỏng:** backend trả text lỗi → hiện trong message mới; card `error`. (Không cần FE tự đếm TTL.)
- **Reload giữa chừng:** pendingWrite ephemeral → mất card (text đề xuất vẫn còn trong history). Chấp nhận (token cũng hết hạn).

## 5. Test (vitest + RTL, mirror style hiện có)
- `ChatClient`/`applyFrames`: frame `pending_write` → `msg.pendingWrite` set đúng (token/title/fields); frame KHÔNG vào text.
- `ConfirmCard.test.tsx`: render title/summary/fields; `null` khi không có pending; click Xác nhận → gọi `onConfirm(true)`, disable khi `sending`; trạng thái `done/cancelled/error` ẩn nút + badge.
- Round-trip (mock `fetch`): bấm → POST `/api/chat` body chứa `{confirm:{token,approve}}` + conversationId; stream vào message mới; card → resolved.
- Giữ test FE cũ xanh (slot null khi rỗng).

## 6. Ràng buộc & coordination
- FE **sở hữu** `components/chat/*` — additive, **không rewrite** frame-router của SP-4 (chỉ THÊM nhánh `pending_write` vào `applyFrames`). Nếu SP-4/ai đang sửa các file này → đồng bộ trước.
- Backend gate đã end-to-end; card là mảnh cuối → xong là luồng write **dùng được** (cần `npm run db:migrate 0003` đã chạy + Ollama).
- agent-ops-rules: không tự chạy dev/build ngầm; verify bằng vitest + (nếu được phép) preview.

## 7. Success criteria
1. Model đề xuất write → chat hiện **card** (title/summary/fields) + 2 nút; text đề xuất hiện, **không** lòi JSON frame.
2. Xác nhận → POST `{confirm:{token,approve:true}}` → kết quả stream vào message mới; card → `done`.
3. Huỷ → `approve:false` → "Đã huỷ"; card → `cancelled`. Không double-submit.
4. 0 write → không có card (bong bóng thường nguyên vẹn). Test FE cũ xanh + test mới.
