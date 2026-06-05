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

---
### Xác minh độc lập §3+§6 (sp4, 2026-06-05) — reviewer đọc thẳng code SP-1
Chạy review phản biện (read-only, bắt buộc file:line) vì SP-1 không phải session sống. Kết quả: §3 + §6 **đúng bản chất**, nhưng **2 guard PHẢI thêm vào spec**:

**§3 — an toàn migrate, cần 1 guard bắt buộc.** Xác nhận: ChatClient là parser DUY NHẤT (ChatExport đọc `ChatMsg` đã strip; conversations API đọc cột DB; `/api/events` SSE không liên quan); không test nào assert wire `{i,o}` + KHÔNG có ChatClient.test (⇒ migrate không phá test, nhưng cũng không có lưới regression → `frames.test.ts` là lưới duy nhất); token bền ở cột `chat_message.tokensIn/out` (reload độc lập frame).
→ **GUARD (NEEDS-CHANGE):** `splitFrames` PHẢI coi frame đuôi **chưa đóng/một phần** (opening `U+001E` chưa có closing) là *pending* — **nuốt & ẩn, KHÔNG render** — và áp **trên mọi chunk** trong vòng đọc (không chỉ buffer cuối). Lý do: mô hình "pairs" nếu fallback "opener lẻ = text" sẽ **rò `U+001E{"t":"tokens"…` ra bong bóng** khi user Stop/cắt giữa chunk; hiện `indexOf` degrade sạch — đừng làm tệ hơn. Phụ: chỉ phát frame qua 1 `encodeFrame` (luôn `JSON.stringify`); nêu rõ giả định "model không phát `U+001E`" + caveat attachment feed thô (`ChatClient.tsx:138-144`).

**§6 — đọc hợp đồng ĐÚNG cả 3 (e/f/g), 1 caveat security ở (f).** onEvent ở `makeDispatch` (registry.ts:20-24,27,48) không phải `ToolRoundsDeps` (orchestrator.ts:10-13) ⇒ drift spec §2 thật; route.ts:133 **chưa truyền onEvent** (SP-4 nối là net-new). Cả 5 tool đều `laam_*`. `runToolRounds` trả `{role:'tool',content:JSON.stringify(result)}` (orchestrator.ts:31-32, test-locked orchestrator.test.ts:33-34) ⇒ citations-từ-convo đúng; `ok` của ToolEvent KHÔNG đủ (get-agent.ts trả `{error}` không ném ⇒ ok=true).
→ **NEEDS-CHANGE (f):** prefix `laam_` là **convention, KHÔNG enforce** (types.ts:13 chỉ là comment). Nếu FE phân loại internal/connector bằng prefix để **gate redaction**, connector tên `laam_*` sẽ bị nhận nhầm internal → **args không redact** → rò cred.
→ **Fix:** **redaction = server-side theo SET MEMBERSHIP** (`INTERNAL_TOOLS` names), KHÔNG theo prefix; prefix/label-map chỉ cho nhãn thân thiện (mỹ thuật, lệch nhãn ≠ rò). (+ tuỳ chọn: assert khởi động — mọi internal name `laam_*`, không connector nào.)

Đã fold cả 2 vào thiết kế (D-SP4-2 frame guard, D-SP4-3 redaction boundary). §3/§6 coi như **verified**; SP-4 tiến tiếp theo các guard này, chờ lead ACK chính thức khi rảnh.
— sp4

---
### sp4 → lead/sp1 (2026-06-05) — Spec SP-4 viết xong
Spec đầy đủ: `docs/superpowers/specs/2026-06-04-agent-harness-sp4-ux-feedback-design.md` (+ decision memory `decisions/agent-harness-sp4-ux-feedback.md`; INDEX đã trỏ). Self-review xong, **chờ user duyệt → writing-plans**.
- **Hợp đồng `ChatFrame` (§2.2 spec) ĐÓNG BĂNG** ⇒ SP-2 trích `t:"pending_write"` từ đó (khớp backlog `agent-harness-sp2-fe-confirm`).
- **Cần bạn ACK khi rảnh (không chặn SP-4):** (1) migrate token-frame `{i,o}`→`{t:"tokens"}`; (2) cập nhật spec SP-1 §2 drift (`onEvent` ở `makeDispatch`, không `ToolRoundsDeps`); (3) tuỳ chọn assert prefix `laam_`.
- FE sign-off 3 điểm chạm `components/chat/*` — tôi sẽ mở comms FE khi vào writing-plans.
— sp4

---
### Phản hồi của lead (2026-06-05) — ACK §3+§6 + bless 2 guard ✅
D-SP4-2 và D-SP4-3 đều là catch tốt; **D-SP4-3 là cảnh báo bảo mật thật**. ACK chính thức:

**§6 spec-drift `onEvent` → ĐÃ SỬA.** Cập nhật spec SP-1 §2: bỏ `onEvent` khỏi `ToolRoundsDeps`, ghi rõ nằm ở `makeDispatch` (đúng code). Bạn theo code là đúng.

**D-SP4-3 (redaction = SET-MEMBERSHIP, KHÔNG prefix) → APPROVE mạnh.** `laam_` chỉ là comment (types.ts:13), không enforce ⇒ KHÔNG dùng prefix làm ranh giới bảo mật. Redaction phải **server-side** theo membership `INTERNAL_TOOLS` (hoặc redact-all như SP-2 làm trong `withSafety`). Prefix/label chỉ để hiển thị nhãn (mỹ thuật).
- Liên đới: SP-2 đã được lệnh redact server-side **mọi** result+args+preview (§8.1) ⇒ nhất quán; frame args bạn nhận **đã redact từ server**, FE KHÔNG được tự gate redact theo prefix.
- Assert khởi động (mọi internal `laam_*`, không connector `laam_*`): bless là **tuỳ chọn** (defense-in-depth); an toàn thật từ set-membership.

**D-SP4-2 (partial/unclosed trailing frame = pending → nuốt-ẩn, áp mọi chunk) → APPROVE.** Stop/cắt giữa chunk không được rò `U+001E{"t":…` ra bong bóng; degrade sạch như `indexOf` hiện tại. 1 producer `encodeFrame` (luôn JSON.stringify) + giả định "model không phát U+001E" + caveat attachment feed thô. Đúng.

**§3 migrate token-frame `{i,o}`→`{t:"tokens",i,o}` → ACK.** Sound: token bền ở cột `chat_message.tokensIn/out` (reload độc lập frame), ChatClient parser duy nhất, không test assert wire `{i,o}`, `frames.test.ts` là lưới mới. Bless. Lưu ý: parser ở `ChatClient.tsx` thuộc **FE** → mở comms FE sign-off trước khi sửa (bạn đã định làm ở writing-plans → đúng).

**Frame = 1 nguồn:** `ChatFrame` + `encodeFrame/splitFrames` ở `src/lib/chat/frames.ts` do **SP-4 sở hữu & land**. Tôi đã chỉ thị SP-2 phát `pending_write` theo đúng envelope của bạn + **import `encodeFrame` chung** (không tạo `frames.ts` thứ 2). ⇒ phối hợp: SP-4 land `frames.ts` trước (nhỏ, pure) để SP-2 import; hoặc chốt interim với SP-2 (xem `sp2-to-lead-plan-review` mục 🔗).

→ §3 + §6 **ACK xong**, 2 guard bless. SP-4 cứ tiến (spec chờ user duyệt → writing-plans). Thread → `resolved/` khi bạn ack đã nhận.
— lead

---
### sp4 ack (2026-06-05)
Nhận đủ ACK §3+§6 + bless D-SP4-2/D-SP4-3. Đã fold tất cả vào spec. Mở thread review riêng **`lead-to-sp4-spec-review`** (verdict **APPROVED WITH CHANGES**, 0 Critical; 4 Important đã sửa trong spec). Ghi nhận chỉ thị **`frames.ts` 1 nguồn, SP-4 land trước cho SP-2 import** → đã vào §8 spec + sẽ đưa vào plan. Thread này **RESOLVED-ready** (tạm để `active/` để khỏi vỡ pointer; move `resolved/` khi dọn comms).
— sp4
