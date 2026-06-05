# comms: sp2 → reviewer — Code review SP-2 "Actions & safety" (trước merge)

**Từ:** orchestrator SP-2 · **Tới:** code-reviewer (/ lead nếu kiêm) · **Ngày:** 2026-06-05
**Trạng thái:** OPEN — xin review **implementation** trước Phase 7 (merge). Spec + plan đã được lead APPROVED (`comms/resolved/sp2-to-lead-plan-review`, `lead-to-sp2-spec-review`). Phản hồi: append file này; chuyển `resolved/` khi xong.

## Đối tượng review
- **Branch:** `feat/agent-harness-sp2` · **Worktree:** `.claude/worktrees/agent-harness-sp2` (từ HEAD `12a97d7`).
- **9 commit** (`4c7cf76`→`2b5b3e0`, 1/task): `git log --oneline main..feat/agent-harness-sp2`.
- **Nguồn chân lý:** spec `docs/superpowers/specs/2026-06-04-agent-harness-sp2-actions-safety-design.md` · plan `docs/superpowers/plans/2026-06-04-agent-harness-sp2-actions-safety.md` · decision [[agent-harness-sp2-actions-safety]].

## Đã làm + verify
- File mới: `src/lib/agent/safety/{redact,policy,token,preview,audit,gate,resume}.ts` (+tests) · `src/lib/chat/frames.ts` (+test). Sửa: `src/app/api/chat/route.ts` (+test).
- `npx vitest run` = **451 pass** (94 files; baseline 415 + 36 mới). `npx tsc --noEmit` = **clean (exit 0)**.
- Ràng buộc giữ: **zero đổi hợp đồng SP-1** (gate = wrapper); **không schema** (dùng `audit_log`); `frames.ts` land-first cho SP-4 (chỉ `encodeFrame`+type); `route.ts` co-touch SP-4 (additive).

## 🎯 Trọng tâm review (an toàn — đây là tính năng safety, soi kỹ)
1. **Không có đường write bypass.** Có path nào write chạy mà KHÔNG qua confirm? Kiểm `withSafety` (throw trước `inner`), route catch `PendingWriteSignal`, resume `confirmedAction` one-shot (match theo TÊN — đủ an toàn vì route cấp signed args?).
2. **Token (`token.ts`).** Reuse `encryptJson` (AES-256-GCM): toàn vẹn + bảo mật (args ẩn). Verify `openPendingWrite` chặn tamper/hết hạn; route chặn `userId` mismatch + nonce reuse. **Args-trong-token-mã-hoá** có chấp nhận không?
3. **Resume không double-execute (`resume.ts` + route `handleConfirm`).** `dispatch` đúng 1 lần + completion **tools-rỗng** (không `runToolRounds`) ⇒ không tool_call mới. Nonce dedupe trước execute. Soi kỹ §6.3.
4. **Redaction phủ đủ (`redact.ts`).** Áp result (wrapper) + args/preview (`buildPreview`) + audit (`buildAuditRecord`). Có path nào cred lọt vào model context / persist / log không? (Rủi ro gốc: Trello `?key=…&token=…`.)
5. **Classification fail-closed (`policy.ts`).** Connector tool lạ → write/gated + log. Internal qua `Tool.kind`.
6. **Route wiring.** Union body `{message}|{confirm}`; `streamOllama` extract (token frame legacy giữ nguyên = `SEP`); `streamText` (pending_write qua `encodeFrame`); fail-soft cũ giữ (lỗi tool-loop thật → stream thường). Interim-graceful frame (ChatClient cũ `indexOf` ẩn frame).

## Quyết định CHỦ ĐÍCH — mời phản biện
- **Preview luôn dựng từ code** (`buildPreview(args)`), KHÔNG dùng `content` của model (Rule 13 + né đụng orchestrator). Đánh đổi: card kém "tự nhiên" hơn prose model.
- **Resume = 1 completion tools-rỗng** thay `runToolRounds([])` (an toàn hơn — không loop, không dispatch hallucinated). Lead đã bless.
- **Nonce race tồn dư** (không unique index — threat model nội bộ, defer fix bền cho SP-3). Đã nêu rõ, không giấu (Rule 12).
- **`confirmedAction` match theo TÊN** (resume tự cấp đúng signed args).

## Cần reviewer
Soi correctness + security. Báo finding ở đây; **bất kỳ write-bypass / cred-leak = BLOCKING**. Nếu OK → tôi sang Phase 7 (merge/PR). Lưu ý chưa chạy `next build` (tsc+vitest đủ; precedent named-export `buildOllamaPayload`) + chưa smoke runtime (user chạy server+Ollama).

---
### Phản hồi của code-reviewer (lead) — VERDICT: ✅ APPROVED
**Ngày:** 2026-06-05 · Review trên worktree `feat/agent-harness-sp2` @ `2b5b3e0`: đọc THẬT 9 file `safety/*` + `frames.ts` + `route.ts`, đối chiếu hợp đồng SP-1 (`orchestrator.ts`/`registry.ts`). **Verify độc lập:** `npx tsc --noEmit` = exit 0; `npx vitest run` = **94 files / 451 pass / 0 skip** (khớp claim, Rule 12). `resume.test`/`gate.test` encode đúng intent (Rule 9).

**KẾT LUẬN: KHÔNG write-bypass, KHÔNG cred-leak ⇒ qua được Phase 7.** Soi theo 6 trọng tâm:

1. **Write-bypass — XÁC NHẬN KHÔNG CÓ.** `makeDispatch` là chokepoint DUY NHẤT (grep: chỉ `route.ts` dùng, 2 call-site `:151`/`:360`, **cả hai bọc `withSafety`**). Điểm load-bearing: `withSafety` throw `PendingWriteSignal` **trước** `inner` (`gate.ts:49` trước `:52`) ⇒ né `try/catch` của `makeDispatch` (`registry.ts:42-45`) — nếu throw nằm TRONG makeDispatch thì catch sẽ nuốt thành `{error}` và write bị skip âm thầm. Throw ngoài là đúng. `runToolRounds` await dispatch không try/catch (`orchestrator.ts:31`) ⇒ signal nổi thẳng lên route catch (`:175`).
2. **Token — CHẤP NHẬN args-trong-token-mã-hoá.** AES-256-GCM ⇒ args ẩn + tag chống tamper. `openPendingWrite` chặn tamper/format/hết hạn. **userId match enforce ở route `:346`**; `convId` lấy TỪ TOKEN (`:350`) không từ client ⇒ không redirect write sang conversation khác. Window dedupe 10' > TTL 5' ⇒ token còn hạn không lọt.
3. **Resume không double-execute — XÁC NHẬN BẤT KHẢ THI VỀ CẤU TRÚC.** dispatch đúng 1 lần (`resume.ts:57`) + `buildResumeRequest` KHÔNG field tools (`:34`, test `.not.toHaveProperty("tools")`) + route stream vòng text TRỰC TIẾP qua `streamOllama`, KHÔNG qua `runToolRounds` (`:385`/`:399`). Nonce check trước execute. Đúng yêu cầu §Critical.
4. **Redaction — XÁC NHẬN phủ đủ.** `redact(boundOutput(result))` áp MỌI result (read + confirmed write) ⇒ vá lỗ hổng connector-không-bound của SP-1; preview + audit + tool-message resume đều redact. Regex bắt `?key=&token=` (kể cả nhúng JSON URL) + Bearer + gh_.
5. **Classification fail-closed — XÁC NHẬN.** internal tự khai `Tool.kind`; không khớp → `"write"` (gated) + warn. Write tool mới không thể ungated âm thầm.
6. **Route wiring — XÁC NHẬN.** Union body sạch; suspend persist assistant = `preview.summary` (không rỗng ⇒ history Turn-2 đủ); fail-soft non-PendingWrite giữ nguyên; token frame legacy giữ single-SEP.

Phản biện 4 quyết định chủ đích (preview code-truth · resume tools-rỗng · nonce match theo tên · race defer): **ĐỒNG Ý cả 4.**

**Findings — đều KHÔNG chặn merge:**
- 🟠 **[Quan trọng, khuyến nghị] Thiếu test tích hợp route.** `route.test.ts` chỉ phủ helper thuần; logic an toàn ở `handleConfirm`/`suspendForConfirm` (userId-mismatch→403; write-đề-xuất→suspend-KHÔNG-execute) chỉ verify bằng đọc code + tsc, **không có test**. Units test kỹ nhưng tầng GHÉP dễ regress nhất cho 1 safety feature (vd dời check userId xuống sau execute → suite hiện tại không bắt). Khuyến nghị ≥1 integration test (mock auth/db/fetch) cho 2 bất biến đó — nên làm sớm sau merge.
- 🟡 **Thứ tự merge (frame transitional):** `pending_write` dùng double-SEP `encodeFrame`, token-usage còn single-SEP legacy → client cũ `indexOf(SEP)` ẩn frame ⇒ **confirm card CHƯA render nếu merge SP-2 đơn lẻ** (backend suspend an toàn nhưng user chưa có nút confirm). Phụ thuộc SP-4 `splitFrames` + FE card (`[[agent-harness-sp2-fe-confirm]]`). Không phải defect — là điểm user cần nắm khi quyết thứ tự merge.
- 🟡 **redaction theo PATTERN** — không bắt secret thô trong field JSON không dạng `?key=`/Bearer/gh_. Chấp nhận POC (leak path Trello là query-string đã phủ; args ghi nằm trong token mã hoá). Ghi nhận cho write tool tương lai.
- 🟡 `boundOutput` x2 cho internal tool (guard + withSafety) — vô hại nếu idempotent. Bỏ qua.
- 🟢 **nonce race** (no unique index) — đã nêu rõ, accepted POC, defer SP-3. Rule 12 OK.

**→ APPROVED — clear sang Phase 7.** Khuyến nghị user nắm điểm 🟡 thứ-tự-merge: backend SP-2 merge an toàn, nhưng tính năng chỉ "tròn" khi SP-4 + FE confirm card land. Chuyển thread → `resolved/`.
— lead (code-reviewer)
