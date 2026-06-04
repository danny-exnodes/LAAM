# comms: lead → sp3 — Phối hợp persistence + audit_log với SP-2

**Từ:** lead (PM Agent Harness) · **Tới:** orchestrator SP-3 (Memory & proactive) · **Ngày:** 2026-06-05
**Trạng thái:** OPEN — heads-up + 2 điểm phối hợp. Phản hồi: append file này.

## 1. SP-2 cố tình KHÔNG phụ thuộc tool-turn persistence của bạn
Review SP-2 chốt: resume sau khi user confirm sẽ **execute write đã ký trực tiếp + dựng convo tổng hợp tại chỗ**, không dựa vào tool turns đã lưu (vì SP-1 chưa lưu, mà SP-1→SP-2 không được chờ SP-3). ⇒ SP-2 không bị block bởi bạn.
**Cơ hội cho SP-3:** khi bạn LÀM xong persist tool turns, có thể **đơn giản hoá** resume của SP-2 (replay từ turn đã lưu thay vì dựng tay). Ghi nhận như một follow-up, đừng ép SP-2 đổi trước.

## 2. SP-2 sẽ ghi `audit_log` (bảng có sẵn, KHÔNG đổi schema)
SP-2 insert mỗi write đã-confirm vào `audit_log`, và dùng chính nó để **replay-dedupe** (từ chối token có nonce đã nằm trong audit_log). Nếu SP-3 cũng đụng `audit_log` (vd proactive log), phối hợp để không xung đột ngữ nghĩa cột `action/target`.

## 3. ⚠️ Đánh số migration — bạn là người DUY NHẤT đụng schema
- SP-1: không schema. SP-2: không schema (chỉ dùng audit_log sẵn có). **SP-3 là SP duy nhất thêm migration** (persist tool turns).
- Migration mới nhất hiện tại: `drizzle/0002_natural_chat.sql` (token-usage per message, từ commit `7fd9240`). ⇒ bạn đánh số **0003** trở đi, **ADDITIVE only** (ADD COLUMN/TABLE, backward-compatible), commit `drizzle/`, và nêu rõ "ACTION REQUIRED: npm run db:migrate" (drizzle-kit chạy trên host, không sandbox — xem [[db-migrations]]).
- Lựa chọn persist (thêm role 'tool' + cột `tool_calls` jsonb vào `chat_message`, HAY bảng `chat_tool_call` mới) → cân nhắc giữ `chat_message.role` hiện chỉ 'user'|'assistant'; thêm 'tool' phải kiểm các consumer (`/api/conversations/[id]`, ChatClient) không vỡ.

## Cần bạn
Xác nhận đánh số migration 0003+ và cho biết bạn có đụng `audit_log` không. Reply ở đây.
