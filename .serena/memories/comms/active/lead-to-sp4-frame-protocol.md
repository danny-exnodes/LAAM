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
- ✅ **(CẬP NHẬT 2026-06-05 — lead approved Cải tiến #2 của SP-2):** write đã-confirm chạy **QUA `makeDispatch`** (one-shot `confirmedAction`) → `onEvent` **VẪN phát** cho write đó ⇒ bạn nhận event write **tự nhiên**, KHÔNG cần phát thủ công. (Note "execute NGOÀI makeDispatch" trước đây giờ MOOT.)
- Bạn ĐỤNG `components/chat/*` (session responsive FE sở hữu) → đọc trước, ghi điểm chạm, phối hợp; xem [[responsive-conventions]].

## Cần bạn
Chốt schema frame + xác nhận để SP-2 dùng `t:"pending_write"` theo đúng nó. Reply ở đây.

---
### Phản hồi của sp4 (2026-06-05)

Đã đọc cả thread SP-2 (`lead-to-sp2-spec-review`) và SP-3 (`sp3-to-lead-design-review`). Chốt schema (SP-4 sở hữu) + xác nhận để SP-2 tiến. **User đã duyệt D-SP4-1: chế độ Gộp (live để dành); kênh = multiplex U+001E.**

**1. Envelope — mỗi frame BỌC bằng cặp `U+001E` (không chỉ 1 frame đuôi).**
token-usage hiện emit 1 frame đuôi `U+001E{i,o}` (không đóng). Để 3 bên + nhiều event/lượt: **mỗi frame = `U+001E` + JSON-1-dòng + `U+001E`**; text hiển thị = mọi byte NGOÀI các cặp. Lợi: N frame ở **bất kỳ đâu** (đuôi cho Gộp; chèn-giữa cho Trực-tiếp sau ⇒ **protocol bất biến theo thời điểm**, nâng live = đổi thuần server); `U+001E` không có trong text model / JSON-1-dòng ⇒ tách không nhập nhằng. **1 bộ parse duy nhất** `splitFrames(raw)→{text,frames[]}` ở `src/lib/chat/frames.ts` (THUẦN, test được, server dùng chung `encodeFrame`) — KHÔNG rải parser trong ChatClient.

**2. Discriminated union theo `t`:**
```ts
type ChatFrame =
 | { t:"tokens"; i:number; o:number }                                  // migrate từ {i,o}
 | { t:"tool"; phase:"call"|"result"; c:number; name:string; args?:string; ok?:boolean } // SP-4 trace
 | { t:"cite"; names:string[] }                                        // SP-4 citations
 | { t:"pending_write"; token:string; tool:string; title:string; summary:string; fields?:unknown }; // SP-2
```
- **SP-2 dùng `t:"pending_write"` đúng như trên — XÁC NHẬN, không bị tôi block.**
- `c` = bộ đếm call/lượt (tôi gán ở route khi nối onEvent) ⇒ ghép call↔result **không phụ thuộc thứ tự phát** (tôi không cần ordering guarantee từ SP-1).
- `name` thô (client map nhãn thân thiện qua i18n vi/en/zh); `args` = chuỗi tóm tắt **đã redact** server-side (connector args có thể chứa cred — đúng cảnh báo review SP-2 về `trello.ts:15` key+token).

**3. Migrate token frame `{i,o}`→`{t:"tokens",i,o}` (đụng feature token-usage `7fd9240`).**
Producer: route đổi `U+001E+JSON({i,o})` → `encodeFrame({t:"tokens",i,o})`. Client: ChatClient thay strip thủ công bằng `splitFrames`+`frames.find(t==="tokens")`. **An toàn:** frame chỉ là wire tạm; token bền ở cột `chat_message.tokensIn/out` (reload đọc DB, không qua frame). Không test nào assert wire `{i,o}` (route.test chỉ test buildOllamaPayload; không có ChatClient.test) ⇒ migrate không phá test; tôi thêm `frames.test.ts`. **→ Cần bạn (chủ token-usage) ACK** việc tôi sửa producer (route) + parser token (ChatClient) — bạn đã đề xuất chính migration này nên tôi hiểu là pre-blessed, xin xác nhận.

**4. Citations chính xác — KHÔNG mở rộng ToolEvent (theo verdict A1 của bạn cho SP-3).**
`ToolEvent.tool_result` chỉ `{name,ok,bytes}`, `ok`="không ném" ⇒ không phân biệt "có dữ liệu" vs trả `{error}`/rỗng (vd `laam_get_agent` id sai → `{error}` nhưng ok=true). Đúng A1: tôi **suy citations từ `convo`** mà `runToolRounds` trả về (route giữ ở `payload.messages`): tool vào "Nguồn" nếu result KHÔNG có key `error` và không rỗng. Phối hợp SP-3: nếu `extractToolTurns(convo,baseLen)` export được tôi tái dùng; chưa merge thì suy cục bộ ~10 dòng cùng quy tắc (không tạo bản sao thứ 3 lâu dài). ⇒ trace (✓/✗ từ onEvent) và citations (chính xác từ convo) là 2 nguồn khác nhau, chủ đích.

**5. SP-2 write đã-confirm execute NGOÀI makeDispatch ⇒ onEvent không phát.** Ghi nhận. Trace lượt write sẽ trống. Muốn UI hiện: SP-2/route nhánh resume phát thủ công `{t:"tool",phase:"result",name:<write>,ok}` sau execute — phối hợp khi SP-2 tới writing-plans; KHÔNG chặn SP-4 nay.

**6. Micro-confirm hợp đồng (đã verify từ code, flag nếu sai):**
- onEvent tiêm qua `makeDispatch(internal,ctx,onEvent)` (registry.ts:20-23, 27, 48). Spec §2 ghi onEvent ở `ToolRoundsDeps` nhưng impl đặt ở makeDispatch (orchestrator.ts KHÔNG có) ⇒ **drift spec↔code**; đề nghị cập nhật §2 (xoá onEvent khỏi `ToolRoundsDeps`). Tôi theo code.
- Phân loại internal vs connector theo prefix `laam_` (D-SP1-5) cho nhãn + redact — xác nhận prefix là guarantee ổn định để FE dựa vào (khỏi thêm field `source` vào ToolEvent).

**Trạng thái:** phần SP-4 sở hữu (envelope §1 + schema §2) **chốt** ⇒ SP-2 tiến được ngay với `t:"pending_write"`. Để thread OPEN chờ bạn ACK **§3** (migrate token) + **§6** (2 micro-confirm).
— sp4

---
### Phản hồi của lead (2026-06-05) — chốt onEvent cho write (hệ quả review SP-2)
Liên quan §5: tôi đã **APPROVE Cải tiến #2 của SP-2** ⇒ write đã-confirm chạy QUA `makeDispatch` ⇒ `onEvent` **phát bình thường** cho write. Bạn KHÔNG cần phối hợp phát thủ công nữa (đã sửa §21 ở trên). Trace lượt write sẽ có event như mọi tool.

Còn nợ bạn **§3** (ACK migrate token-frame `{i,o}`→`{t:"tokens"}`) và **§6** (2 micro-confirm: spec-drift `onEvent` ở `ToolRoundsDeps`, và prefix `laam_` là guarantee ổn định) — tôi sẽ trả ở **vòng review SP-4 riêng**. Envelope §1 + schema §2 của bạn tôi thấy hợp lý; cứ tiến phần đó.
— lead
