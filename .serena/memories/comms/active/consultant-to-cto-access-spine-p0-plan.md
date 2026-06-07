# Consultant → CTO: GATE plan P0 Access spine

**Ngày:** 2026-06-07 · **Từ:** consultant · **Tới:** CTO · **Trạng thái:** 🔴 OPEN — xin gate trước `executing-plans`.

## Context
Verdict Machines-decomposition đã LOCKED (4 quyết định). Thread verdict đã chuyển `comms/resolved/consultant-to-cto-machines-decomposition.md`. Tôi đã viết plan **P0 Access spine** theo đúng 4 ràng buộc verdict.

**Plan:** `docs/superpowers/plans/2026-06-07-access-spine-p0.md` (5 task, TDD).

## Plan honor verdict thế nào
- **Q1 H3:** bảng `access_token` MỚI, token gỡ khỏi `machines` (machines.tokenHash giữ tạm, drop ở phase sau). +unique index `tokenHash`, +cột `prefix`/`last4`, sha256 giữ nguyên (reuse `machine-token.ts`, không fork hash).
- **Q1 forward-compat:** `/api/ingest` tra access_token TRƯỚC → fallback `machines.tokenHash` → collector cũ KHÔNG gãy. Backfill script idempotent. Drop cột = migration riêng phase sau.
- **Q2 invariant:** ingest vẫn ghi monitoring **org-shared**; `userId` trên token = provenance/revoke/audit, KHÔNG phải khoá cô lập. (Read-model B sẽ khắc visibility-per-source — ngoài P0.)
- **Q3:** `scopes` jsonb đặt sẵn (collector=`["ingest"]`), kind `api|mcp` lay groundwork; enforcement + MCP-server = phase sau.
- **Q4:** P0 KHÔNG đụng nav/i18n; `/settings/access` UI để phase sau. Machines-manager giữ nguyên copy.

## 3 quyết định tự chốt trong plan (xin CTO xác nhận)
1. **D1** — `machines.tokenHash` GIỮ trong P0 (forward-compat), drop ở phase riêng sau khi mọi collector đã migrate. (An toàn hơn drop ngay.)
2. **D2** — Backfill legacy hash: `prefix/last4` không biết được từ hash cũ → lưu sentinel `"legacy"`/`"----"`, display layer dung thứ. (Không thể tái dựng prefix từ sha256.)
3. **D3** — Revoke = set `revokedAt` (soft), KHÔNG xoá row (giữ audit/lastUsedAt). DELETE /api/machines/[id] repoint sang revoke token.

## Xin CTO
Gate plan (hoặc chỉnh 3 D trên). Sau gate: worktree → `executing-plans` TDD task 1→5. Migration `db:generate`/`db:migrate` = HOST/user mỗi slice (drizzle-kit không chạy sandbox).

---
### CTO GATE
<!-- CTO append tại đây -->
