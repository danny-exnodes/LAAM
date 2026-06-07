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
**Ngày:** 2026-06-07 · **Từ:** CTO · **Trạng thái:** ✅ GATED — plan duyệt, honor đủ 4 verdict. 3 D xác nhận, kèm **1 sửa bắt buộc (A1)** + 1 việc-làm-ngay (A2) + 1 nit (A3).

**Đã verify từ code trước khi gate:** `DELETE /api/machines/[id]` hiện tại **đã là soft-revoke** (`set machines.tokenHash=null`, giữ machine+sessions — đúng comment route), KHÔNG xoá row. Nên D3 an toàn, KHÔNG vướng cascade `access_token.machineId onDelete:cascade`. Plan đứng vững.

**3 D — xác nhận:** D1 ✅ (giữ `machines.tokenHash` trong P0 = đúng forward-compat tôi mandate ở Q1) · D2 ✅ (không tái dựng prefix/last4 từ sha256 → sentinel là lựa chọn đúng; xem A3) · D3 ✅ (soft-revoke = đúng, kèm A1).

**A1 — SỬA BẮT BUỘC (correctness, Rule 12): DELETE phải revoke CẢ HAI đường.**
Sau backfill, mỗi machine mang ĐỒNG THỜI `machines.tokenHash` (legacy, giữ) **và** `access_token` cùng hash. Ingest resolver tra access_token trước, fallback machines.tokenHash. Vậy nếu DELETE chỉ null `machines.tokenHash` (như "current semantics") mà KHÔNG set `revokedAt` trên access_token → **collector vẫn push được qua đường access_token → revoke giả**. Ngược lại cũng hở. ⇒ DELETE trong P0 BẮT BUỘC: `machines.tokenHash=null` **AND** `revokedAt=now()` trên MỌI access_token non-revoked link tới machineId đó. **Test bắt buộc (Task 4):** machine đã-backfill → DELETE → ingest **401 qua CẢ HAI đường** (không còn path nào sống). Đây là điều kiện gate, không phải gợi ý.

**A2 — LÀM NGAY (rẻ, fulfill Q2 từ ngày đầu): set `access_token.userId`.**
Cột đã có sẵn; không wiring = phí chính verdict Q2 (attribution-recorded). POST `/api/machines` → `userId = session.user.id` (người cấp). Backfill (Task 5) → `userId = machine.ownerUserId`. Nhắc lại invariant: đây là **provenance/audit**, KHÔNG phải khoá cô lập — ingest vẫn ghi org-shared (plan Task 3 đã đúng).

**A3 — nit:** thống nhất sentinel `last4` (plan dùng cả `"????"` dòng 79 lẫn `"----"` D2) → chọn **`"----"`**. Prefix sentinel `"legacy"` giữ (không đụng prefix thật `laam_`). Rotate token legacy sau này tự lành sentinel.

**Không cản:** scopes jsonb laydown (Q3 groundwork), kind api|mcp chưa enforce, không đụng nav/i18n (Q4) — đúng scope P0.

**Gate:** ✅ vào `executing-plans` task 1→5 SAU khi nhúng A1+A2+A3 vào plan. Migration `db:generate`/`db:migrate` chạy ở HOST (drizzle-kit không chạy sandbox) — plan đã ghi đúng. Verify cuối: tsc sạch + full suite + round-trip issue→ingest→revoke→ingest-401 (CẢ legacy path, theo A1).
<!-- /CTO gate -->
