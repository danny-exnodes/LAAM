# Agent Harness — Integration Plan (Phase 1: reconcile SP-2/3/4 + 4 cross-SP items)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans hoặc subagent-driven-development. Steps dùng checkbox.

**Goal:** Đưa `/api/chat` + lớp frame thành **một khối nhất quán, compile được, test xanh** trên main sau khi SP-2/SP-3 (đã merge) + SP-4 (sắp merge) gộp lại; thực thi 4 điểm coordination chéo-SP.

**Architecture:** `route.ts` là điểm hợp lưu của cả 3 SP (SP-2 suspend/resume+union body · SP-3 summary/proactive/persist/baseLen · SP-4 onEvent+trailing frames+token-migrate). Plan reconcile theo MỘT thứ tự chuẩn + 1 `frames.ts` + 1 convo-extractor + suspend-flush.

---

## ⚠️ Hiện trạng đã VERIFY (2026-06-05) — main đang GÃY

`git log`: SP-2 (`3e6a1de`) + SP-3 (`4fa6625`) đã merge vào main (HEAD `2705f4a`). **NHƯNG `npx tsc --noEmit` FAIL — 5 lỗi ở `route.ts`:**
- `(10,*) & (17,*)` **Duplicate identifier `encodeFrame`/`ChatFrame`** — 2 import từ `@/lib/chat/frames` (merge artifact SP-2↔SP-3).
- `(11,53)` **Cannot find module `@/lib/chat/trace`** — `import { makeFrameCollector, deriveCitations }` (đồ SP-4 *chưa land*; `trace.ts` ở branch `2be5db0`, chưa merge). **Chỉ ở dòng import, KHÔNG dùng trong body.**

**Hệ quả:** main không build → **chặn mọi session** branch/ build từ main (docker standalone, FE). → Task 0 là P0.

**Trạng thái module (verified):**
- `src/lib/chat/frames.ts` ✅ có `SEP`+`encodeFrame`+`ChatFrame` (SP-2 land); **chưa có `splitFrames`** (SP-4).
- `src/lib/chat/trace.ts` ❌ chưa land (SP-4 branch `2be5db0`: `makeFrameCollector`/`deriveCitations`/redact args).
- `route.ts` (513 dòng): SP-2+SP-3 đã đan; token frame vẫn raw `SEP+JSON({i,o})` (dòng 337, **chưa migrate** — SP-4).

> **Coordination:** có commit `516719f docs(serena): … integration backlog`. KIỂM TRA xem có session integration nào đang sở hữu việc này trước khi sửa main (tránh giẫm chân). Nếu có → phối hợp; nếu không → tiến Task 0.

---

## Task 0: 🔴 KHÔI PHỤC MAIN XANH (P0 — làm NGAY, không chờ SP-4)

**Files:** Modify `src/app/api/chat/route.ts` (chỉ phần import đầu file).

- [ ] **Step 1: Xác nhận gãy** — `npx tsc --noEmit 2>&1 | grep route.ts` → 5 lỗi như trên.
- [ ] **Step 2: Sửa import** đầu `route.ts`:
  - **Xoá** dòng `import { makeFrameCollector, deriveCitations } from "@/lib/chat/trace";` (đồ SP-4 chưa land, body không dùng).
  - **Gộp** 2 import frames thành 1 (bỏ bản thiếu SEP): giữ `import { encodeFrame, SEP, type ChatFrame } from "@/lib/chat/frames";`, xoá `import { encodeFrame, type ChatFrame } from "@/lib/chat/frames";`.
  - Nếu `import type { ToolEvent } from "@/lib/agent/types";` không được body dùng (tsc/lint báo unused) → xoá luôn (đồ SP-4 chưa cần).
- [ ] **Step 3: Verify** — `npx tsc --noEmit` = **0 lỗi**; `npx vitest run` = xanh (đếm baseline hiện hành); `npm run build` = xanh (chạy trong worktree, KHÔNG in-place khi prod chạy — agent-ops-rules).
- [ ] **Step 4: Commit** — `fix(chat): restore main build — drop dangling SP-4 trace import + dedupe frames import`. (Trailer Co-Authored-By.)

> Sau Task 0, main compile lại. SP-4 sẽ **re-add đúng** `trace.ts` + import khi merge (Task 1).

---

## Task 1: Merge SP-4 vào main (khi SP-4 finish)

**Files:** none (git) — vùng xung đột dự kiến: `route.ts`, `frames.ts`.

- [ ] **Step 1:** SP-4 branch land: `src/lib/chat/trace.ts` (+test) · `frames.ts` thêm `splitFrames` (D-SP4-2 partial-frame guard) · `ToolTrace.tsx`/`Citations.tsx` · route wiring (onEvent collector + trailing tool/cite frames + token-migrate) · chạm FE (`ChatClient`/`types`/`MessageItem`/i18n).
- [ ] **Step 2:** Merge. **Conflict zone** `route.ts` (SP-4 re-add onEvent + deriveCitations + trailing frames + token-migrate vào đúng các điểm Task 0 đã dọn) và `frames.ts` (thêm `splitFrames` vào CÙNG file — không tạo file thứ 2). Reconcile theo Task 2.
- [ ] **Step 3:** `tsc`/`vitest`/`build` xanh trên main đã gộp 3 SP.

---

## Task 2: Reconcile `route.ts` — thứ tự POST chuẩn (canonical)

**Files:** Modify `src/app/api/chat/route.ts`.

Thứ tự BẮT BUỘC (đã có sẵn SP-2+SP-3; chèn SP-4 vào đúng chỗ):

- [ ] **Step 1:** Nhánh `isConfirmBody` → `handleConfirm` (SP-2 resume). *(SP-4: phát `tool` frame cho write đã-confirm — write chạy QUA makeDispatch nên onEvent phát; xem Task 3-C/D.)*
- [ ] **Step 2:** Nhánh thường, đúng thứ tự:
  1. persist user msg → load history (+ `summary`/`watermark`/`proactiveState`).
  2. **summarize** (SP-3): `planHistory` → `summarizeMessages` → update `{summary, summarizedThroughId}`.
  3. `tools = modelToolSchemas(INTERNAL_TOOLS, connectorTools)`.
  4. **proactive** (SP-3): `detectAlerts`→`selectNewAlerts`→`formatProactiveNotice`; update `{proactiveState}`.
  5. system prompt = `buildSystemPrompt(...) + notice` (compose-around); summary thành message #2.
  6. **`baseLen = payload.messages.length`** (SAU summary+proactive — verdict A1).
  7. **SP-4:** `const collector = makeFrameCollector(INTERNAL_TOOLS)` → `onEvent`; `dispatch = withSafety(makeDispatch(INTERNAL_TOOLS, ctx, collector.onEvent), {internal})`.
  8. `try { payload.messages = await runToolRounds(...) ; toolTurns = extractToolTurns(payload.messages, baseLen) }`.
  9. `catch PendingWriteSignal` → **SUSPEND** (SP-2): preview+token+`pending_write` frame **+ Task 3-C flush** `collector.frames` (read trước write).
  10. else → `streamAnswer`: SP-3 persist `toolTurns` + **SP-4** trailing `collector.frames` + `deriveCitations(payload.messages, baseLen)` cite frame + **token frame migrate** (Task 3-D).
- [ ] **Step 2b:** Đảm bảo `makeDispatch` được gọi VỚI `onEvent` (hiện main gọi không onEvent — dòng ~215).
- [ ] **Step 3:** `tsc` xanh.

---

## Task 3: 4 điểm coordination chéo-SP

**Files:** `src/lib/chat/frames.ts`, `src/lib/chat/trace.ts`, `src/app/api/chat/route.ts`, `src/components/chat/ChatClient.tsx`.

- [ ] **A — 1 `frames.ts`:** SP-4 thêm `splitFrames` vào file SP-2 đã land (KHÔNG tạo file mới). Verify chỉ 1 `frames.ts`; `encodeFrame` là đường phát duy nhất; `splitFrames` nuốt-ẩn frame đuôi một-phần per-chunk (D-SP4-2). Test `frames.test.ts`.
- [ ] **B — 1 convo-extractor (DRY):** `deriveCitations` (SP-4) tái dùng `extractToolTurns` (SP-3) thay vì parse `convo` lần 2. Refactor: `deriveCitations(extractToolTurns(convo, baseLen))` hoặc cho `trace.ts` import `extractToolTurns` từ `persist.ts`. Verify không có bản parse thứ 2.
- [ ] **C — Suspend-path flush:** trong `catch PendingWriteSignal`, **trước/cùng** `pending_write` frame, phát các `collector.frames` (tool READ chạy trước write) để trace không mất. Test: turn có 1 read + 1 write-proposal → stream chứa cả tool frame(read) lẫn pending_write frame; execute KHÔNG gọi.
- [ ] **D — Token-frame migrate:** thay `controller.enqueue(SEP + JSON.stringify({i,o}))` (route.ts:337) bằng `encodeFrame({t:"tokens", i, o})`; `ChatClient` đổi strip thủ công → `splitFrames` router. **Phối hợp FE sign-off** (ChatClient thuộc FE). Verify token vẫn hiện đúng + reload đọc token từ cột DB (không qua frame).

---

## Task 4: Test tích hợp tổng hợp

**Files:** `src/app/api/chat/route.test.ts` (+ pure tests đã có của từng SP).

- [ ] **Step 1:** route.test mở rộng — 1 luồng đọc: tool read → trace frame + cite frame + persist row + token frame (mock `@/db`, `execute`, Ollama). 1 luồng write: propose → `pending_write` frame + flushed read frames, `execute` KHÔNG gọi. 1 luồng confirm: `execute` đúng 1 lần + stream.
- [ ] **Step 2:** `npx vitest run` (toàn bộ) xanh · `tsc` sạch · `npm run build` xanh trên main 3-SP.
- [ ] **Step 3:** Commit + cập nhật Serena (decision `agent-harness-integration` + checkpoint).

---

## Task 5: Hoàn thiện FE (phối hợp session responsive-FE)

**Files (FE sở hữu — additive, cần sign-off):** `ChatClient.tsx`, `chat/types.ts`, `MessageItem.tsx`, i18n `chat.{vi,en,zh}`; **mới (SP-4):** `ToolTrace.tsx`, `Citations.tsx`; **SP-2:** confirm card component.

- [ ] **Step 1:** Mở comms FE (`lead/sp4-to-frontend-*`) — 3 điểm chạm + confirm card + frame-router (`splitFrames`).
- [ ] **Step 2:** Render: ToolTrace (trên MarkdownView), Citations (footer), pending_write → confirm card → `POST /api/chat {confirm}`. Null khi rỗng (0 tool → vô hình).
- [ ] **Step 3:** FE sign-off + test component xanh.

---

## Task 6: Bàn giao Phase 2 (nghiệm thu runtime — host)

- [ ] Soạn checklist nghiệm thu (Phase 2): `db:migrate 0003` → live Ollama: hỏi "agent nào kẹt?" (tool+trace+cite) · write confirm (trello_create_card → card → execute 1 lần) · proactive notice · summarize hội thoại dài. **User chạy trên host** (agent-ops-rules: lead không tự chạy dev/ollama).

---

## Success Criteria
- [ ] **Task 0:** main `tsc`+build xanh lại (P0).
- [ ] main 3-SP: `tsc` sạch · full vitest xanh · `next build` xanh.
- [ ] 1 `frames.ts` · 1 convo-extractor · suspend-flush hoạt động · token-frame migrate không vỡ.
- [ ] route.test tổng hợp phủ read/write/confirm.
- [ ] Hợp đồng SP-1 vẫn không đổi (types/registry/orchestrator/context diff rỗng).
- [ ] FE render trace/citations/confirm; nghiệm thu host pass (Phase 2).
