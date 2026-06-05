# Backlog: Reconcile `/api/chat/route.ts` khi merge SP-2 + SP-3 (cross-SP)

**Người mở:** lead (phiên review SP-2→SP-3, 2026-06-05) · **Cho:** integrator / owner merge harness.
**Nguồn:** review code SP-2 (`comms/resolved/sp2-to-reviewer-code-review`) + SP-3 (`comms/active/sp3-to-reviewer-implementation-review`). Cả 2 verdict = APPROVED/YES độc lập; đây là rủi ro **MERGE**, không phải defect.

## Vấn đề
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

## Liên quan
[[agent-harness-coordination]] · [[agent-harness-sp2-actions-safety]] · [[agent-harness-sp3-memory-proactive]] · [[agent-harness-sp2-fe-confirm]] (FE confirm card cần SP-4 `splitFrames`).
