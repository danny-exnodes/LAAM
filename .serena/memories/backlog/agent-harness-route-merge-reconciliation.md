# Backlog: Reconcile `/api/chat/route.ts` khi merge SP-2 + SP-3 (cross-SP)

**Người mở:** lead (phiên review SP-2→SP-3, 2026-06-05) · **Cho:** integrator / owner merge harness.
**Nguồn:** review code SP-2 (`comms/resolved/sp2-to-reviewer-code-review`) + SP-3 (`comms/active/sp3-to-reviewer-implementation-review`). Cả 2 verdict = APPROVED/YES độc lập; đây là rủi ro **MERGE**, không phải defect.

## ✅ STATUS (2026-06-05, lead) — SP-2 + SP-3 ĐÃ MERGE vào `main`
- `516719f` docs · `3e6a1de` Merge SP-2 (clean) · `4fa6625` Merge SP-3 (**route.ts reconcile thủ công** theo §"Điểm phải reconcile" dưới — `streamOllama` đã tham số hoá `{toolTurns, assistantMsgId}`; gate `withSafety` + suspend/confirm GIỮ; baseLen/persist/summarize/proactive GIỮ).
- Verify trên merged main: `tsc` sạch + **471 test pass** (97 file). `npm run db:migrate` (0003) đã chạy host — `chat_tool_call` + 3 cột live (4 migration tracked).
- **✅ SP-4 ĐÃ MERGE (`578f0ae`, 2026-06-05):** 3-way LẦN 2 xong — `frames.ts` lấy bản SP-4 (superset `splitFrames`); `trace.ts`+components+i18n clean adds; `route.ts` reconcile canonical (onEvent collector **BÊN TRONG** `withSafety(makeDispatch(…,onEvent))`; `deriveCitations` share `baseLen`; token-frame `{i,o}`→`encodeFrame({t:tokens})` qua `streamOllama({persist,frames})`; suspend flush read-frames trước `pending_write`; confirm-path phát tool frame). **Verify merged main: `tsc` sạch + 490 test (101 file); hợp đồng SP-1 diff RỖNG; 1 `frames.ts`/1 `trace.ts`.**
- **⚠️ ĐÍNH CHÍNH cái §ĐÍNH CHÍNH dưới:** main **COMMITTED chưa bao giờ đỏ** — `git show HEAD:route.ts` ở `4fa6625`/`2705f4a` sạch (1 import frames, không `trace`). 5 lỗi `tsc` lead#2/sp4 thấy là từ **working-tree dirty** (bản hand-edit SP-4 chưa commit), `tsc` đọc working-tree chứ không đọc blob committed → quy nhầm cho HEAD. Đã `git checkout HEAD -- route.ts` bỏ bản dở rồi merge branch SP-4 đúng cách (Rule 13: verify blob, đừng tin claim).
- **Follow-up vẫn mở (KHÔNG chặn):** (1) DRY `deriveCitations`↔`extractToolTurns` (nay parse convo 2 lần); (2) persist tool-turn cho confirm-path (resume `streamOllama` KHÔNG `persist`); (3) SP-2 FE confirm-card render (`pending_write` parse rồi nhưng chưa có card — `agent-harness-sp2-fe-confirm`); (4) repoint `/api/stats`→`_load`; (5) `next build` + live `/chat` E2E (host, agent-ops-rules).

## Vấn đề (lịch sử — đã xử lý cho SP-2/SP-3)
SP-2 (`feat/agent-harness-sp2` @ `2b5b3e0`) và SP-3 (`feat/agent-harness-sp3` @ `2215f14`) **cùng nhánh từ base `12a97d7`** và **cùng viết lại vùng chồng nhau** của `src/app/api/chat/route.ts`. Merge cả hai = 3-way merge THỦ CÔNG, không auto.

## Điểm phải reconcile (file:line theo từng nhánh)
1. **`dispatch`** — SP-2: `withSafety(makeDispatch(INTERNAL_TOOLS, ctx), {internal})` (route:151). SP-3: `makeDispatch(INTERNAL_TOOLS, ctx)` (route:193). **Gộp:** `withSafety(makeDispatch(…, ctx SP-3 {userId,now,lang}), {internal})`.
2. **stream/finally** — SP-2 tách `streamOllama`/`streamText` (tái dùng cho resume). SP-3 inline stream + thêm `db.insert(chatToolCalls)` (persist tool-turn) trong `finally` + `messageId: full?id:null`. **Gộp:** dùng `streamOllama` của SP-2, nhét persist tool-turn của SP-3 vào finally của nó + giữ token-frame `{i,o}`.
3. **`runToolRounds` catch** — SP-2: catch `PendingWriteSignal` → `suspendForConfirm`. SP-3: catch → `extractToolTurns(payload.messages, baseLen)`. **Gộp phải làm CẢ HAI:** `catch (e) { if (e instanceof PendingWriteSignal) return suspend; /* else: tool-loop lỗi, toolTurns=[] */ }` — và `extractToolTurns` chỉ chạy ở nhánh THÀNH CÔNG (sau khi `runToolRounds` trả về, trước catch), giống SP-3 hiện tại.
4. **`baseLen`** (SP-3, route:213) phải chụp SAU khi cả summary splice + proactive compose chạy — giữ nguyên thứ tự A1 của SP-3 khi gộp.

## Gap sau gộp (follow-up, KHÔNG chặn merge)
- **Write đã-confirm chưa persist vào `chat_tool_call`.** SP-2 `handleConfirm` (path confirm) chạy `runResume` + `streamOllama` nhưng KHÔNG gọi `extractToolTurns`/persist (persist của SP-3 nằm ở POST chính). ⇒ write đã-confirm không lưu tool-turn. Đã nêu ở `comms/resolved/lead-to-sp3-persistence-and-audit` #1 (cơ hội đơn giản hoá resume bằng replay khi cả hai merge). Sửa sau khi gộp.

## Vận hành — HARD GATE
- **`npm run db:migrate` (migration `0003`) phải chạy trên host TRƯỚC/CÙNG khi deploy** bản gộp. Lý do: `route:93` `db.select().from(chatConversations)` là select-ALL → sinh `SELECT …, summary, proactiveState`; DB chưa migrate → conversation CŨ throw → POST 500 (không try/catch). Conversation MỚI + summarize/proactive/persist thì fail-soft. ⇒ migrate trước, không "fail-soft nếu chưa migrate" như mô tả ban đầu.

## Quy trình đề xuất
1. Merge 1 nhánh vào main trước (đề xuất **SP-2** = sàn an toàn write-gate, hoặc SP-3 = additive schema — tuỳ user).
2. Rebase nhánh còn lại lên main mới; **reconcile `route.ts` thủ công bởi 1 owner** theo 4 điểm trên.
3. Chạy lại `npx tsc --noEmit` + `npx vitest run` (kỳ vọng ≈ 415 baseline + 36 SP-2 + 20 SP-3 − test route trùng; xác nhận số thực sau gộp).
4. Chạy `npm run db:migrate` trên host trước khi live.
5. (Follow-up) persist tool-turn cho path confirm; repoint `/api/stats` → `_load`.

## ⚠️ ĐÍNH CHÍNH (2026-06-05, lead#2 — verify độc lập) — main HIỆN ĐỎ, KHÔNG "tsc sạch"
`npx tsc --noEmit` trên HEAD `2705f4a` = **5 lỗi ở `route.ts`** (Rule 13: trust code > claim):
- dòng 10 & 17: **Duplicate identifier `encodeFrame`/`ChatFrame`** (2 import từ `@/lib/chat/frames`).
- dòng 11: **Cannot find module `@/lib/chat/trace`** (`makeFrameCollector, deriveCitations` — đồ SP-4, `trace.ts` ở branch `2be5db0` chưa merge; **chỉ ở import, body KHÔNG dùng**).
⇒ Các import SP-4 đã **lọt vào route.ts tại merge SP-3 (`4fa6625`)** — KHÔNG phải "CÒN LẠI cho SP-4" mà đang **live & gãy build**. Claim "tsc sạch + 471 pass" ở §STATUS **không khớp** state hiện tại (có lẽ verify nhầm state / chưa chạy tsc trên bản reconcile cuối).
**Fix P0 (≈3 dòng, KHÔNG cần SP-4):** xoá import `@/lib/chat/trace` + gộp 2 import frames → `import { encodeFrame, SEP, type ChatFrame } from "@/lib/chat/frames";` (+ xoá `ToolEvent` nếu unused). Chi tiết + verify: **`docs/superpowers/plans/2026-06-05-agent-harness-integration.md` Task 0**.
→ ⚠️ Mọi session đang branch/build từ main ĐỎ này (docker standalone, FE sẽ fail). Cần áp Task 0 NGAY.

## ✅ SP-4 READY cho merge (2026-06-05, sp4) — branch `feat/agent-harness-sp4` (thay §9 cũ)
SP-4 (UX feedback) XONG + verified độc lập: **9 commit, 436 test xanh, tsc sạch** trên branch (base `98c18c7`, TRƯỚC SP-2/SP-3 merge). Checkpoint `sp4-2026-06-05`; spec/plan `docs/superpowers/{specs,plans}/2026-06-04-agent-harness-sp4-ux-feedback*`.
**Clean adds (lấy nguyên, KHÔNG đụng SP-2/SP-3):** `src/lib/chat/frames.ts` (`encodeFrame`/`splitFrames`/`FRAME_SEP`/`ChatFrame` — **chính là module mà import gãy ở main đang thiếu** ⇒ SP-4 merge GIẢI QUYẾT P0 đúng, không cần stopgap xoá import) · `src/lib/chat/trace.ts` (`makeFrameCollector`/`deriveCitations`/`summarizeArgs`) · `src/components/chat/{toolLabel,ToolTrace,Citations}.tsx` · 7 i18n key `chat.*`.
**Reconcile `route.ts` (3-way lần 2, vào bản đã-SP-2+SP-3):**
1. **dispatch:** dựng `const {onEvent, frames: toolFrames} = makeFrameCollector(new Set(INTERNAL_TOOLS.map(t=>t.name)))` rồi truyền `onEvent` làm **arg 3** của makeDispatch, BÊN TRONG withSafety: `withSafety(makeDispatch(INTERNAL_TOOLS, ctx, onEvent), {internal})`.
2. **token-frame — BẮT BUỘC:** thay frame `{i,o}` cũ bằng trailing frames tagged: `[...toolFrames, {t:"cite",names:cites}?, {t:"tokens",i,o}]` qua `encodeFrame`. Lý do: FE (ChatClient Task 7) nay parse bằng `splitFrames`, **KHÔNG đọc `{i,o}` nữa** → nếu giữ `{i,o}` thì token-count live vỡ. Giữ `db.insert(chatToolCalls)` persist của SP-3 trong finally; phát frames SAU persist.
3. **citations:** `cites = deriveCitations(payload.messages, baseLen)` ở nhánh thành công — dùng CHUNG `baseLen` của SP-3; nên share `extractToolTurns` (DRY — đã đồng bộ ở A2 / `lead-to-sp4-spec-review`).
**FE (lấy nguyên SP-4 Task 7):** `ChatClient.tsx` parser→`splitFrames` (đã xoá byte SEP thô) + `setLastAssistant` +2 param + `withAttachments` strip `\x1e` · `types.ts` `ChatMsg` +`toolTrace?`/`cites?` · `MessageItem.tsx` 2 slot. **Hội tụ với FE-confirm card SP-2** (`agent-harness-sp2-fe-confirm`): 1 bộ `splitFrames` router theo `t` xử cả `pending_write` (SP-2) + `tool`/`cite`/`tokens` (SP-4).
**Pending (chờ user, KHÔNG chặn merge):** `npm run build` + live `/chat` preview (Success #5 E2E của SP-4).
— sp4

## Liên quan
[[agent-harness-coordination]] · [[agent-harness-sp2-actions-safety]] · [[agent-harness-sp3-memory-proactive]] · [[agent-harness-sp2-fe-confirm]] (FE confirm card cần SP-4 `splitFrames`). Plan tích hợp đầy đủ: `docs/superpowers/plans/2026-06-05-agent-harness-integration.md`.
