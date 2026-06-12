# Admin cấp access-key cho user khác (v2.4.1)

**Nguồn:** workflow phản biện thiết kế 4 lăng kính (security/data-model/product/completeness) + synthesis. Plan: `docs/superpowers/plans/2026-06-12-admin-provisioned-access-keys.md`. Hoàn tất phần "key↔user 2 chiều" của yêu cầu (b) mà batch2 cố ý để self-service.

## Ground truth quyết định (verify code)
- `access_token.userId` = **attribution/provenance**, KHÔNG phải khoá cô lập MCP đang hoạt động. Tool `laam_*` không lọc `ctx.userId` → đọc monitoring org-shared. ⇒ admin cấp khoá read-only cho X **không** lộ dữ liệu riêng của X, **không** mở rộng tầm với của admin so với UI. (Đính chính claim sai ở `rbac-live-holes-and-batch2.md`.)
- Mọi token minted = **read-only** (`scopes:["read"]`, write defer Q3).

## Quyết định (Q-A..Q-F + open#5)
- **Q-A** `createdByUserId` (migration 0014, nullable set-null): **IN**. Cột read-path cho keys-expander + badge "cấp bởi"; tái dựng từ audit_log JSON là scan không index.
- **Q-B** ai cấp: **owner/admin**, NHƯNG admin **không** cấp cho target owner/admin — chỉ owner mới được (chặn rửa-danh-nghĩa + primitive leo thang tương lai). 1 nhánh guard, không state machine.
- **Q-C** chống mạo danh attribution: **KHÔNG** đủ chỉ audit lúc cấp → thêm marker code-set: hậu tố tên `(provisioned by <admin>)` (từ session, không echo — Rule 13) + `createdByUserId` hiện ở keys list & `/settings/access` của chính chủ. Stamp per-use lên `agent_session` → **DEFER** (đụng bảng nóng).
- **Q-D** target: tồn tại (404) + chưa disabled (400). Dùng id từ bản ghi DB, không từ body.
- **Q-E** reveal-once cho admin: **CHẤP NHẬN** cho team <50 + guardrail (token không vào audit/log; `no-store`; cảnh báo trung thực; marker phân biệt). Pending-key/user-tự-mint (không lộ secret) = tốt hơn nhưng là state machine → backlog.
- **Q-F** gate `laam_query_audit`: **IN SCOPE** — `eq(auditLog.userId, ctx.userId)`; principal rỗng → fail-closed. (PR này thêm row nhạy cảm vào log đó nên phải đóng cùng PR.)
- **open#5** bảng all-keys org-wide: **DEFER** — expander per-user + self-service đã đủ 2 chiều; revoke-by-id đã phủ incident.

## Hardening kèm theo (phòng thủ chiều sâu)
- `verifyAccessToken` từ chối nếu chủ sở hữu `disabledAt` set (disable tối thượng dù token-row chưa revoke). Bỏ qua khi userId null (collector).
- Audit `token_revoked_for` khi owner/admin revoke khoá người khác (đối xứng với `token_issued_for`); self-revoke không log.

## Deviation so với synthesis (có chủ đích)
- GET cross-user **KHÔNG** join `users` lấy tên provisioner; chỉ trả `createdByUserId`, UI map sang tên từ danh sách user nó đã có. Đơn giản hơn + member ở self-view chỉ thấy "cấp bởi quản trị viên" (generic, không lộ tên admin).
- `laam_query_audit` principal rỗng → **fail-closed** (synthesis ghi `: undefined` org-wide) — chặt hơn, không caller hợp lệ nào chạm.

## Backlog mở
`access-mcp-orgshared-read.md` · `access-per-use-attribution.md` · `access-provisioned-key-handoff.md`. Khi MCP write GA: re-gate cấp-khoá-write về **owner-only**.
