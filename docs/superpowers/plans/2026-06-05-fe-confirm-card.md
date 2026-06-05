# FE Confirm-Card — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans hoặc subagent-driven-development. Steps dùng checkbox. TDD.

**Goal:** Render confirm-card cho hành động write của SP-2 + round-trip confirm, trên nền frame-router SP-4 đã có.

**Architecture:** Additive vào `components/chat/*` (FE sở hữu): thêm nhánh `pending_write` vào `ChatClient.applyFrames` → state `ChatMsg.pendingWrite`; component `ConfirmCard.tsx`; slot trong `MessageItem`; round-trip tái dùng stream helper với body `{confirm}`. KHÔNG đổi backend, KHÔNG đổi `frames.ts`/`trace.ts`.

**Spec:** `docs/superpowers/specs/2026-06-05-fe-confirm-card-design.md` (nguồn chân lý). Wire contract: `backlog/agent-harness-sp2-fe-confirm.md`.

---

## Tiền đề (đọc trước — Boot Protocol + Rule 8)
- `.serena/memories/INDEX.md` → `decisions/responsive-conventions.md` (bạn sở hữu) · `agent-harness-sp2-actions-safety.md` · backlog `agent-harness-sp2-fe-confirm.md`.
- Code: `src/components/chat/{ChatClient,MessageItem,types}.tsx`, `src/lib/chat/frames.ts` (ChatFrame có `pending_write`). Đọc `ChatClient.applyFrames` + `setLastAssistant` + helper POST/stream (`streamReply`) để biết điểm cắm.

## Task 1: State `ChatMsg.pendingWrite`
**Files:** Modify `src/components/chat/types.ts`.
- [ ] Thêm `export type PendingWrite = { token:string; tool:string; title:string; summary:string; fields?:{label:string;value:string}[]; status:"idle"|"sending"|"done"|"cancelled"|"error" };` và `ChatMsg += { pendingWrite?: PendingWrite }` (optional, backward-compatible).
- [ ] `npx tsc --noEmit` sạch.

## Task 2: Route frame `pending_write` (TDD)
**Files:** Modify `src/components/chat/ChatClient.tsx` + test.
- [ ] **Test trước:** mở rộng/ tạo test cho `applyFrames` (hoặc test stream): cấp frames `[{t:"pending_write",token:"T",tool:"trello_create_card",title:"Tạo card Trello",summary:"…",fields:[{label:"Tiêu đề",value:"Mua sữa"}]}]` → message cuối có `pendingWrite.token==="T"`, `status==="idle"`; frame KHÔNG nằm trong `text`.
- [ ] **Impl:** trong `applyFrames`, thêm `else if (f.t === "pending_write") pendingWrite = {token:f.token, tool:f.tool, title:f.title, summary:f.summary, fields:f.fields, status:"idle"};`. Khai báo `let pendingWrite: PendingWrite | undefined;`. Truyền vào `setLastAssistant(...)` (thêm 1 param optional song song `cites`; cập nhật `setLastAssistant` nhận + gắn `pendingWrite`).
- [ ] Test xanh; `tsc` sạch.

## Task 3: `ConfirmCard.tsx` (TDD)
**Files:** Create `src/components/chat/ConfirmCard.tsx` + `ConfirmCard.test.tsx`.
- [ ] **Test trước:** render `{title,summary,fields,status:"idle"}` → thấy title/summary/từng field; 2 nút. Click "Xác nhận" → gọi `onConfirm(true)`; "Huỷ" → `onConfirm(false)`. `status:"sending"` → nút disabled. `status:"done"|"cancelled"|"error"` → ẩn nút, hiện badge. Props không có pending → component cha không render (hoặc trả null nếu nhận undefined).
- [ ] **Impl:** component nhận `{ pending: PendingWrite; onConfirm:(approve:boolean)=>void }`; render theo §4.3 spec; style theo `responsive-conventions` (card bo góc/viền, nút primary/secondary, spacing `p-4 sm:p-6` nếu hợp). i18n keys §4.5.
- [ ] Test xanh.

## Task 4: Slot trong `MessageItem` (TDD)
**Files:** Modify `src/components/chat/MessageItem.tsx` (+ test nếu có).
- [ ] Nhánh assistant: render `{msg.pendingWrite && <ConfirmCard pending={msg.pendingWrite} onConfirm={...}/>}` **dưới** text (song song slot ToolTrace/Citations). Null khi rỗng → bong bóng ca 0 write không đổi (giữ test cũ xanh).
- [ ] `onConfirm` đẩy lên ChatClient (callback prop) — xem Task 5.

## Task 5: Round-trip confirm (TDD, tái dùng stream helper)
**Files:** Modify `src/components/chat/ChatClient.tsx` + test.
- [ ] **Test trước (mock `fetch`):** gọi handler confirm(approve=true) cho 1 message có `pendingWrite` → `fetch('/api/chat', { body chứa "confirm":{token,approve:true} + conversationId })` đúng 1 lần; tạo message assistant mới; sau stream, card cũ `status==="done"`. approve=false → body `approve:false`, card `cancelled`. Lỗi/`!res.ok` → `status:"error"`.
- [ ] **Impl:** thêm `handleConfirm(msgId, approve)`: set `pendingWrite.status="sending"` (disable) → gọi helper POST/stream hiện có với body `{confirm:{token,approve}, conversationId}` (tái dùng đường streamReply, chỉ đổi body + KHÔNG append user message) → stream vào assistant message mới → set card `status = approve?"done":"cancelled"`; catch → `"error"`. Truyền `handleConfirm` xuống `MessageItem`→`ConfirmCard`.
- [ ] Test xanh; `tsc` sạch.

## Task 6: i18n vi/en/zh
**Files:** Modify `src/i18n/dictionaries/chat.{vi,en,zh}.*` (theo cơ chế hiện có).
- [ ] Thêm keys `chat.confirm`, `chat.cancel`, `chat.confirmSending`, `chat.confirmDone`, `chat.confirmCancelled`, `chat.confirmError` (+ `chat.confirmAction` nếu dùng). Cả 3 ngôn ngữ.
- [ ] `ConfirmCard` dùng `t(...)` thay vì hardcode.

## Task 7: Verify + handoff
- [ ] `npx vitest run` (chỉ main src, loại `.claude/worktrees`) xanh — test cũ + mới. `npx tsc --noEmit` sạch.
- [ ] (Nếu được phép) preview: dựng 1 frame `pending_write` giả lập / hoặc nghiệm thu cùng Phase 2 host.
- [ ] Commit theo convention; reply comms `lead-to-frontend-confirm-card` (kết quả + test count); cập nhật `backlog/agent-harness-sp2-fe-confirm` → done.

## Success Criteria (từ spec §7)
- [ ] Write proposal → card (title/summary/fields) + 2 nút; không lòi JSON frame.
- [ ] Xác nhận → POST `{confirm:{token,approve:true}}` → kết quả stream message mới; card `done`. Huỷ → `cancelled`. Không double-submit.
- [ ] 0 write → không card; test FE cũ + mới xanh; `tsc` sạch.
- [ ] Additive — không rewrite frame-router SP-4, không đổi backend.
