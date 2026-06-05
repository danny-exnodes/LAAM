# Decision: Agent Harness SP-2 — Actions & Safety

**Ngày:** 2026-06-05 · **Vai trò:** orchestrator SP-2 · **Trạng thái:** spec APPROVED-WITH-CHANGES (lead) → đã sửa → chờ lead re-review §6 → writing-plans.

**Tài liệu đầy đủ:** `docs/superpowers/specs/2026-06-04-agent-harness-sp2-actions-safety-design.md` (đọc file đó để biết chi tiết — memo này là pointer + chốt quyết định). Tiền đề: hợp đồng SP-1 [[agent-harness-sp1-foundation-design]] **cố định**.

## Vấn đề
Cho model **thực hiện write** (internal + connector) **an toàn**: mỗi write cần **người xác nhận** trước khi chạy; mọi tool qua guardrail đầy đủ tại chokepoint. Tool-loop SP-1 chạy server-side TRƯỚC khi stream ⇒ write sẽ chạy *vô hình* nếu không gate. Bề mặt write hiện tại = **đúng 1 tool** `trello_create_card` ⇒ SP-2 là **KHUNG an toàn**, không thêm tool write (YAGNI).

## Decision log (chốt)
- **D-SP2-1:** Gate = lớp bọc **`withSafety`** quanh `dispatch` của SP-1 ⇒ **ZERO đổi hợp đồng** (`types/registry/orchestrator/guardrails` không sửa). Throw `PendingWriteSignal` xuyên `runToolRounds` lên route.
- **D-SP2-2:** Token niêm phong = **`encryptJson` (AES-256-GCM) tái dùng `lib/connectors/crypto`** (không HMAC tự viết) — toàn vẹn + **bảo mật** (client thấy blob mờ, args ẩn). Stateless (user đã chọn), không schema. TTL 5'; ràng `userId`; nonce.
- **D-SP2-3 (🔴 lead re-review):** Resume = verify token → **execute signed write 1 lần trong code** (không hỏi lại model — Rule 13) → dựng convo tổng hợp tại chỗ → sinh **text-only (tools rỗng)** → **bỏ READ Turn 1**. Chống double-execute mà **không** phụ thuộc tool-turn của SP-3.
- **D-SP2-4:** Proposal/card **luôn** dựng từ `buildPreview(args)` (code-truth), không từ prose model; tránh persist message rỗng.
- **D-SP2-5:** Phân loại connector = set tên (`policy.ts`) + **fail-closed** (tool lạ → write/gated + log). Thêm `kind` vào connector = defer.
- **D-SP2-6:** Redact áp **result + args + preview + audit**; bound connector — **vá lỗ hổng SP-1** (connector không qua `guard()`/`boundOutput`).
- **D-SP2-7:** Always-confirm (không trust toggle) POC; audit qua `audit_log` **sẵn có** (action `"agent_write"`); race nonce tồn dư (không unique index) = defer SP-3.

## Cross-SP (qua comms)
- **SP-4:** phát frame `{t:"pending_write",…}` theo schema discriminated chung **SP-4 sở hữu**; đề xuất write-đã-confirm chạy **qua** makeDispatch (one-shot `confirmedAction`) ⇒ `onEvent` vẫn phát (cải thiện note cũ). Xem `comms/active/lead-to-sp4-frame-protocol.md`.
- **SP-3:** SP-2 **không** đụng schema; chỉ `audit_log`. Unique-index nonce = việc SP-3. Xem `comms/active/lead-to-sp3-persistence-and-audit.md`.

## Files
Mới: `src/lib/agent/safety/{policy,gate,token,preview,redact,audit}.ts` (+tests). Sửa: `src/app/api/chat/route.ts` (union body + suspend/resume). Handoff FE: [[agent-harness-sp2-fe-confirm]] (backlog). **Không** đụng `components/chat/*`, connectors, schema.

## Liên quan
[[agent-harness-architecture]] · [[agent-harness-sp1-foundation-design]] · [[agent-ops-rules]] · [[poc-model-choice]].
