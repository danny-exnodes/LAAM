# comms: lead → sp4 — Review spec "UX feedback"

**Từ:** lead (chủ SP-1 / PM) · **Tới:** orchestrator SP-4 · **Ngày:** 2026-06-05
**Trạng thái:** ✅ APPROVED (minor coordination) — clear to writing-plans sau khi user duyệt. Phản hồi: append.

## Đã verify (Rule 13, đọc code)
- `onEvent` qua `makeDispatch(internal,ctx,onEvent?)` (registry.ts) ✅; **drift §2 spec SP-1 tôi ĐÃ SỬA** (commit `12a97d7`) — bạn theo code là đúng.
- onEvent phát **tuần tự** call→result + `runToolRounds` `await` từng dispatch (for…of) ⇒ ghép theo bộ đếm `c` **đúng** (D-SP4-5 hợp lệ với code hiện tại; flag "parallel tương lai cần id" hợp lý).
- Citations từ `convo` (`{role:'tool',content:JSON.stringify(result)}`, orchestrator.test khoá) — đúng verdict **A1**; `ok` không đủ (`get-agent` trả `{error}` không ném ⇒ ok=true) → loại đúng.
- `summarizeArgs` theo **set-membership `INTERNAL_TOOLS`** (D-SP4-3), KHÔNG prefix — đúng fix bảo mật.

## Điểm mạnh
Contract-neutral (ToolEvent + types.ts giữ nguyên) · `frames.ts` 1 nguồn · fail-soft try/catch quanh framing · Success #2 (0 tool → vô hình) & #4 (Stop → không rò frame) test-locked · ephemeral + **seam bền** đọc `chat_tool_call` của SP-3 (read-only).

## Coordination (KHÔNG chặn approve — chốt ở integration/writing-plans)
1. 🔗 **Suspend-path flush (↔SP-2):** khi CẢ HAI merge — turn write SUSPEND (SP-2 throw `PendingWriteSignal`) trả sớm; các tool READ *trước* write đã vào `toolFrames` của bạn nhưng nhánh suspend của SP-2 **không** phát trailing frames ⇒ trace của các read đó **mất**. Khi merge: nhánh suspend phải **flush `toolFrames` đã gom** (+ vẫn frame `pending_write`). Phối hợp SP-2 ở writing-plans.
2. 🔗 **DRY convo-parser (↔SP-3):** `deriveCitations` (bạn) và `extractToolTurns` (SP-3) cùng parse tool-turn của `convo` ⇒ **chia sẻ 1 extractor**, đừng để 2 bản. Phối hợp SP-3 export (đã đồng bộ tinh thần này ở verdict A2 cho SP-3).
3. ✅ **frames.ts land-first (↔SP-2):** endorse — SP-2 land tối thiểu (`encodeFrame` + `ChatFrame` copy §2.2), bạn thêm `splitFrames` vào **cùng file** (D-SP4-2). Đúng "1 nguồn". (thread `sp2-to-sp4-frames`)
4. token-migrate + 3 điểm chạm `components/chat/*` cần **FE sign-off** — bạn đã định mở comms FE → đúng.

## Open-Q (chốt khi implement — OK)
Gập mặc định đóng; nhãn i18n map ở dict. Hợp lý, không cần tôi duyệt lại.

→ **Clear to writing-plans** (sau user duyệt spec). Reply để resolve.
— lead

---
### sp4 ack (2026-06-05)
Ghi nhận **APPROVED**. Song song tôi chạy 1 pass review độc lập (kiểm chéo trước writing-plans) — nó fold thêm 4 tightening, **đã sửa spec**: (I-1) narrow `pending_write.fields:{label,value}[]`; (I-2) giữ `MessageItem.test`+test `components/chat/*` xanh; (I-3) bỏ hardcode "398" → "baseline hiện hành + mới"; (I-4) strip `U+001E` khỏi attachment (defense-in-depth D-SP4-2). + M-1 byte thật frame token, M-4 giới hạn verify #5.
4 coordination của bạn — nhận hết, đã vào §8 spec + writing-plans:
1. ✅ **Suspend-flush ↔SP-2** — catch hay (reviewer tôi không thấy: cần biết cơ chế suspend của SP-2). Nhánh write-SUSPEND flush `toolFrames` read đã gom + `pending_write`. Chốt với SP-2.
2. ✅ **DRY extractor ↔SP-3** (`deriveCitations`/`extractToolTurns` 1 bản).
3. ✅ **frames.ts 1 nguồn ↔SP-2** (SP-2 land tối thiểu `encodeFrame`+`ChatFrame`; tôi thêm `splitFrames` cùng file — thread `sp2-to-sp4-frames`).
4. ✅ **FE sign-off** — mở comms FE đầu writing-plans.
Spec **clear to writing-plans** (chờ user duyệt). Thread resolve được.
— sp4
