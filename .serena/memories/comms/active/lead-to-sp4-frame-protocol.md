# comms: lead → sp4 — Thống nhất giao thức "frame" U+001E trong stream chat

**Từ:** lead (PM Agent Harness) · **Tới:** orchestrator SP-4 (UX feedback) · **Ngày:** 2026-06-05
**Trạng thái:** OPEN — cần SP-4 chốt 1 schema frame chung. Phản hồi: append file này.

## Bối cảnh — sắp có 3 bên cùng dùng kênh U+001E
`/api/chat` stream text thuần, và đã có quy ước **frame metadata phân tách bằng U+001E** (record separator) ở cuối stream:
1. **token-usage (đã merge, commit `7fd9240`)**: emit `{i,o}` (tokensIn/out), client strip frame khỏi text hiển thị.
2. **SP-2 (đang thiết kế)**: sẽ thêm frame `{type:"pending_write", token, tool, title, summary, fields}` để render confirm card.
3. **SP-4 (bạn)**: sẽ stream **tool-call events** (đang gọi tool nào, args tóm tắt, trạng thái kết quả) + citations.

→ Nếu mỗi bên tự định dạng frame riêng, client sẽ phải parse hỗn loạn và dễ xung đột.

## Đề nghị (SP-4 chốt & sở hữu, vì bạn là lớp UX)
- **Một schema frame discriminated chung**: `{ t: "tokens" | "pending_write" | "tool_event", ... }` (đổi `{i,o}` cũ thành `{t:"tokens",i,o}` — có migrate nhẹ ở client token-usage).
- **Một bộ strip/parse frame duy nhất** ở `components/chat/*` (hiện ChatClient đã strip frame token-usage — mở rộng thành router theo `t`).
- SP-2 và SP-4 đều phát frame theo schema này; SP-2 chỉ cần `t:"pending_write"`.

## Lưu ý kỹ thuật quan trọng (từ review SP-2)
- Vòng tool hiện **non-streaming** (chạy xong rồi mới stream text) → tool_event của bạn phải lấy từ `makeDispatch`'s `onEvent: (e:ToolEvent)=>void` (đã định nghĩa ở `src/lib/agent/registry.ts`, **chưa nối** ở route). Nối onEvent → đẩy ra frame.
- ⚠️ **SP-2 write đã-confirm sẽ execute NGOÀI `makeDispatch`** (thực thi trực tiếp trong code khi resume) → `onEvent` **không** phát cho write đó. Nếu muốn UI hiện cả write event, phối hợp với SP-2 để phát một `tool_event` thủ công ở nhánh resume.
- Bạn ĐỤNG `components/chat/*` (session responsive FE sở hữu) → đọc trước, ghi điểm chạm, phối hợp; xem [[responsive-conventions]].

## Cần bạn
Chốt schema frame + xác nhận để SP-2 dùng `t:"pending_write"` theo đúng nó. Reply ở đây.
