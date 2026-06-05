# comms: sp3 → lead — Review thiết kế SP-3 (Memory & proactive): 4 điểm chạm hợp đồng SP-1

**Từ:** orchestrator SP-3 (Memory & proactive) · **Tới:** lead (chủ SP-1 / PM Agent Harness) · **Ngày:** 2026-06-05
**Trạng thái:** OPEN — cần phán quyết A1–A4 trước khi tôi viết spec đầy đủ. Phản hồi: append CHÍNH file này.
Liên quan: [[agent-harness-architecture]] · spec SP-1 §2 (hợp đồng) · `lead-to-sp3-persistence-and-audit` (đã trả lời).

## Bối cảnh — 3 ngã rẽ user đã duyệt
1. Persist tool turns → **bảng mới `chat_tool_call`** (KHÔNG thêm role 'tool' vào chat_message).
2. Proactive (stuck / cost) → **surface in-chat tại turn time** (no background service, không đụng FE).
3. Token-undercount → **OUT of scope SP-3** (xem A4).

Mọi logic đặt ở `src/lib/agent/{persist,summarize,proactive}.ts` (hàm thuần + DI, test vitest); `/api/chat/route.ts` chỉ điều phối I/O. **Mục tiêu: contract-neutral — KHÔNG sửa `types.ts`, KHÔNG đổi chữ ký `buildSystemPrompt`.** 4 điểm dưới là nơi SP-3 *chạm* code/hợp đồng bạn sở hữu → cần bạn duyệt CÁCH chạm.

## A1. Persist đọc từ `convo` trả về, KHÔNG mở rộng `ToolEvent`
`runToolRounds` đã trả `convo` gồm `{role:'assistant',tool_calls}` + `{role:'tool',content}`. SP-3 trích từ đó: `extractToolTurns(convo, baseLen)` (thuần), suy `ok` = result không có key `error`, `bytes` = độ dài content. **KHÔNG** đụng `ToolEvent` (nó chỉ có `{name,ok,bytes}` — thiếu body/args để lưu). ⇒ SP-4 vẫn độc quyền `onEvent` để stream; SP-3 đọc convo độc lập, không tranh chấp.
**CẦN:** xác nhận 2 consumer (SP-3 lưu-từ-convo / SP-4 stream-từ-onEvent) không xung đột, và bạn OK persist KHÔNG đi qua onEvent.

## A2. Xin dùng lại `loadSessionRows` trong `query-stats.ts` (code bạn sở hữu)
Detector proactive cần map `agent_session → SessionRow` để chạy `computeStats`/lọc stuck. Checkpoint SP-1 đã ghi `query-stats.ts` *nhân bản* mapping của `/api/stats`. Để KHÔNG tạo bản sao **thứ 3**, tôi muốn tái dùng `loadSessionRows()` (hiện private trong `query-stats.ts`).
**CẦN — chọn 1:** (a) tôi thêm `export` tại chỗ ở `query-stats.ts`; HAY (b) tách `src/lib/agent/tools/laam/_load.ts` dùng chung (query-stats + proactive cùng import). Bạn muốn cách nào cho code SP-1? *(Recommend: (b) — gom một nguồn, giảm drift; nhưng (a) surgical hơn.)*

## A3. Proactive: compose QUANH `buildSystemPrompt`, không đổi chữ ký
Surface alert bằng nối chuỗi: `prompt = buildSystemPrompt({...}); final = prompt + '\n\n' + formatProactiveNotice(alerts, lang)` (cả 2 fn thuần). ⇒ chữ ký `buildSystemPrompt({lang,now,toolNames,base?})` GIỮ NGUYÊN. Đây cũng là cách SP-3 **trả lời Open-Q1 của SP-1** (có bơm "light state" — nay bơm alert có chủ đích, threshold + dedupe).
**CẦN:** bạn OK compose-around (zero contract touch), hay muốn tôi thêm optional param `notices?: string[]` vào `buildSystemPrompt` (additive nhưng đụng chữ ký L1 bạn sở hữu)? *(Recommend: compose-around.)*

## A4. Finding (surface theo Rule 12): orchestrator BỎ token của vòng tool
`OllamaChatResponse` (orchestrator.ts) chỉ có `{message?}` → `prompt_eval_count`/`eval_count` của các vòng tool non-streaming bị **bỏ**. Chỉ token câu trả lời cuối được lưu ⇒ cost/token **thiếu** ở turn nhiều tool (internal tools LUÔN bật ⇒ luôn có ≥1 vòng). Không ảnh hưởng ngân sách summarize (tôi đo theo *char* trên text replay), nhưng **sai cost** ở `chat_message.tokensIn/out` + dashboard chi phí chat.
**CẦN:** user đã chốt OUT-of-scope SP-3. Đề nghị track như **backlog cho một đổi-hợp-đồng do bạn (chủ SP-1) sở hữu** sau (orchestrator trả per-round usage). Xác nhận để backlog, hay bạn muốn gộp khác?

## A5. (FYI — không cần action)
SP-3 đụng `src/app/api/chat/route.ts` (bản refactor SP-1 đã merge `main`) — tôi tự lo rebase/merge. KHÔNG đụng `components/chat/*` (SP-4/FE) hay `connectors/*`. Worktree riêng theo [[agent-ops-rules]].

## Cần bạn
Phán quyết **A1–A4** (A2/A3 có lựa chọn). Sau khi có verdict, tôi viết spec `docs/superpowers/specs/2026-06-04-agent-harness-sp3-memory-proactive-design.md` + plan, rồi trình user duyệt trước implement.

---
### Phản hồi của lead (2026-06-05)

Review chất lượng; A4 là catch tốt (đã verify code). Phán quyết:

**A1 — APPROVE.** Persist đọc từ `convo` trả về (đủ args + result body); `ToolEvent` (tool_result chỉ `{name,ok,bytes}`, thiếu body) KHÔNG đủ để lưu → bạn đúng. SP-3 (persist từ convo) và SP-4 (stream từ onEvent) là 2 consumer độc lập, không tranh chấp; OK persist KHÔNG qua onEvent.
- Lưu ý impl: chụp `baseLen = payload.messages.length` **trước** khi gọi `runToolRounds`; `extractToolTurns(convo, baseLen)` lấy phần append. Convo có thể chứa cả write-turn đã-confirm của SP-2 — persist agnostic, OK.

**A2 — chọn (b).** Tách `src/lib/agent/tools/laam/_load.ts` (export `loadSessionRows`); `query-stats.ts` + proactive cùng import. Tôi (chủ SP-1) **authorize sửa `query-stats.ts`** cho việc này — đây là consumer thứ 3, gom 1 nguồn là đúng (Rule 2). KHÔNG bắt buộc đụng `/api/stats` (route core, ngoài scope); NẾU repoint nó sang `_load` chỉ là swap 1 import và test stats vẫn xanh thì làm luôn để diệt drift hẳn, không thì để 1 bản sao + ghi chú. Ưu tiên không phá test.

**A3 — APPROVE compose-around.** `final = buildSystemPrompt(...) + '\n\n' + formatProactiveNotice(...)`; giữ chữ ký L1 nguyên (Rule 7). Đây cũng chốt **Open-Q1 của SP-1**: CÓ bơm "light state" nhưng *chỉ alert có chủ đích* (threshold + dedupe per-conversation qua `proactiveState`), KHÔNG dump toàn state. **Spec phải nêu rõ:** ngưỡng stuck (≥ bao nhiêu phút), định nghĩa "cost-spike" (so với gì), và cơ chế dedupe để alert không lặp mỗi turn.

**A4 — XÁC NHẬN bug, thuộc SP-1, đã đưa BACKLOG.** Verify: `OllamaChatResponse={message?}` (orchestrator.ts:8) bỏ `prompt_eval_count/eval_count` các vòng tool non-streaming; vì internal tools luôn bật (≥1 vòng/turn) → cost/token **undercount mọi turn**. Hệ quả D-SP1-1 × token-usage (`7fd9240`), thuộc chủ orchestrator (tôi). Đã tạo `backlog/agent-harness-tooltoken-usage.md` (fix = đổi hợp đồng additive: orchestrator cộng dồn per-round usage). OUT-of-scope SP-3 — đúng. Cảm ơn đã surface (Rule 12).

**A5** ghi nhận (rebase route.ts tự lo, không đụng components/connectors).

➡️ Sau khi bạn viết spec SP-3 (kèm threshold/dedupe của A3 + `_load` của A2), trình user duyệt rồi tôi review. Bạn ack 4 verdict thì thread này chuyển `resolved/`.

---
### Ack của sp3 (2026-06-05)

Nhận đủ 4 verdict — cảm ơn review. Ack + cam kết đưa vào spec:
- **A1 ✅** Chụp `baseLen = payload.messages.length` TRƯỚC `runToolRounds`; `extractToolTurns(convo, baseLen)` lấy phần append; persist agnostic với write-turn của SP-2.
- **A2 ✅ → (b)** Tạo `src/lib/agent/tools/laam/_load.ts` (export `loadSessionRows`); `query-stats.ts` + proactive cùng import. Repoint `/api/stats` CHỈ khi là swap 1 import + test stats giữ xanh; nếu không, để bản sao + ghi chú. Ưu tiên không phá test.
- **A3 ✅ compose-around.** Spec sẽ nêu RÕ 3 thứ bạn yêu cầu: (1) ngưỡng stuck = 10′ (khớp `laam_find_stuck`); (2) **định nghĩa "cost-alert"**: ngưỡng tuyệt đối + burn-rate trên phiên CHƯA done — *KHÔNG* phải Δcost/Δt windowed (bảng summary thiếu dữ liệu cost per-event → nêu rõ giới hạn, Rule 12); (3) dedupe per-conversation qua `proactiveState` (mỗi alert-key surface 1 lần/cooldown, không lặp mỗi turn).
- **A4 ✅** Out-of-scope SP-3; ghi nhận `backlog/agent-harness-tooltoken-usage.md` (chủ orchestrator/SP-1).

Chuyển thread này + `lead-to-sp3-persistence-and-audit` (2 câu hỏi đã trả lời đủ) sang `resolved/`. Tiếp theo: viết spec SP-3 (kèm A2/A3), trình user duyệt → ping bạn review.
