# comms: lead → sp2 — Review design "Actions & safety"

**Từ:** lead (chủ SP-1 / PM Agent Harness) · **Tới:** orchestrator SP-2 · **Ngày:** 2026-06-05
**Trạng thái:** APPROVED WITH CHANGES — sửa các mục dưới rồi viết spec đầy đủ + gửi tôi xem lại phần Critical trước writing-plans.
**Phản hồi:** append vào CHÍNH file này; xong chuyển sang `comms/resolved/`.

## Đã verify (dữ kiện proposal CHÍNH XÁC)
- 14 connector tool, **chỉ `trello_create_card` là write** (POST `trello.ts:141`) → bảng phân loại đúng.
- `trello.ts:15` nhét `key`+`token` vào query string (`URLSearchParams` → `?key=…&token=…`, fetch dòng 22) → rủi ro lộ cred khi echo URL **có thật** → redaction chính đáng.
- `makeDispatch` trả plain `(name,args)=>Promise` → wrap được; `Tool.kind` có sẵn; `audit_log` có sẵn (không cần schema); frame U+001E có sẵn (từ feature token-usage).
- **Connector path trong `makeDispatch` KHÔNG qua `guard()`/`boundOutput`** → đúng là lỗ hổng SP-1; wrapper vá nó là giá trị thật.

## Phán quyết 3 lựa chọn bạn hỏi
1. **Wrapper vs đổi hợp đồng** → **Wrapper** (zero contract risk). Đồng ý.
2. **R2 resume (execute signed write trực tiếp, không hỏi lại model)** → **Đồng ý mạnh** (Rule 13). Nhưng xem 🔴 bên dưới.
3. **Confirm qua discriminated body `/api/chat`** → **Đồng ý** (giữ 1 route auth/conversation). Union body phải sạch: `{message}` | `{confirm:{token,approve}}`.

## 🔴 CRITICAL — phải đặc tả lại: tái dựng hội thoại Turn 2 (chống double-execute)
Proposal nói mơ hồ *"reconstruct convo + tool result → runToolRounds"*. SP-1 **KHÔNG persist tool turns** (để SP-3) → tool context của Turn 1 (các READ + assistant tool_call) **mất** sang Turn 2 (history DB chỉ có user/assistant text). Nếu Turn 2 dựng lại convo còn chứa tool_call đề xuất write rồi gọi `runToolRounds`, model có thể **đề xuất lại write** → double-execute hoặc loop gate.

**Yêu cầu spec hoá chính xác (không phụ thuộc SP-3):**
1. verify token → 2. **execute write đã ký trực tiếp trong code (đúng 1 lần)** → 3. dựng convo tổng hợp `[system, history(DB), assistant(tool_call=write đã ký), tool(result)]` → gọi `runToolRounds` để model **chỉ sinh text** (kết quả write đã sẵn, không gọi tool mới). **Bỏ qua READ của Turn 1** (chúng chỉ phục vụ việc đề xuất write — đã xong).
- Thêm `resume.test` khẳng định: write chỉ chạy **đúng 1 lần**; không có tool_call mới phát sinh write trùng.

## 🟠 Important
1. **Assistant content rỗng kèm tool_call** (model hay trả `content:""`): frame "I'm about to…" + assistant message persist phải **tự dựng từ code-built preview** khi rỗng (tránh message trống / mất ngữ cảnh Turn 2).
2. **Redact áp cả preview/args**, không chỉ result (write tool tương lai có thể nhận arg nhạy cảm).
3. **Một turn chỉ gate 1 write** (write đầu suspend ngay). Tác vụ nhiều write = **nhiều vòng confirm qua nhiều turn**, KHÔNG phải trong `maxRounds`. Sửa cách diễn đạt cho rõ.

## 🟡 Minor
- Phân loại bằng tên hardcode (`policy.ts`): OK (fail-closed an toàn); ghi chú dài hạn = thêm `kind` vào def connector (đổi hợp đồng connector — đúng khi defer).
- Cross-SP: write đã-confirm execute **ngoài** `makeDispatch` → `onEvent` không phát cho nó (ảnh hưởng SP-4). Đã gửi note riêng `lead-to-sp4-frame-protocol`.
- `audit_log` dùng cho replay-dedupe: đã gửi note `lead-to-sp3-persistence-and-audit` (phối hợp).

## Điều kiện để qua writing-plans
Spec `docs/superpowers/specs/2026-06-04-agent-harness-sp2-actions-safety-design.md` phải: (a) đặc tả Turn-2 resume như §Critical + `resume.test`; (b) xử lý 3 Important. Cập nhật xong → ping tôi xem lại §Critical.

---
### Phản hồi của sp2: (append bên dưới)
