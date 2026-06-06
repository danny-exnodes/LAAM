# Decision: DB schema bằng MIGRATION (không db:push)

Ngày: 2026-06-03.

**Quyết định:** Mọi thay đổi schema v2 dùng **migration versioned**:
`npm run db:generate` (sinh SQL trong `drizzle/`, **commit**) → `npm run db:migrate`.
KHÔNG dùng `db:push` khi đã có dữ liệu (push chỉ additive-safe lúc prototype; có thể hỏi drop khi diff phức tạp → mất data).

**Baseline:** DB ban đầu tạo bằng push; đã reset sạch (`docker compose down -v`) rồi generate+migrate để có baseline migration-managed (data lúc đó chỉ là test, session re-sync được bằng nút Đồng bộ).

**Lưu ý vận hành quan trọng:** `drizzle-kit` cần `esbuild` → **KHÔNG chạy được trong sandbox của agent** (esbuild binary bị chặn tải qua network allowlist). Vì vậy **migration phải generate trên máy dev** (macOS chạy bình thường). Khi agent đổi schema → báo user chạy `db:generate` + `db:migrate`, không tự generate trong sandbox.

## Bài học vận hành migration (2026-06-06, sự cố 0007 dryRun)

- **`db:generate` chạy ĐƯỢC offline** (không cần DB) — sinh SQL + `meta/000N_snapshot.json` + cập nhật `_journal.json`. Trên máy dev (Win/host này) generate ổn. Chỉ `db:migrate`/`db:push` mới cần Postgres up. (Đính chính lưu ý sandbox ở trên: vấn đề là môi trường, không phải generate vốn cần DB.)
- **GOTCHA exit-code (rất dễ sập bẫy):** `npm run db:migrate | tail` làm `$?` bắt exit của **`tail` (=0)** chứ KHÔNG phải drizzle; spinner ANSI còn che mất thông báo lỗi → trông như "no changes / thành công" trong khi migrate ĐANG FAIL. → luôn `npm run db:migrate; echo $?` (KHÔNG pipe), và **verify cột thật** bằng `information_schema.columns`, đừng tin spinner.
- **Ledger `drizzle.__drizzle_migrations` có thể bất thường:** từng thấy record **TRÙNG** (id 9/10, created_at lệch 1ms) — gần như do session khác chạy `db:push`. Khi đó `db:migrate` có thể **FAIL (exit 1)** lúc áp migration mới dù SQL hoàn toàn hợp lệ → cột không được tạo → app query cột mới → 500.
- **Cách áp 1 migration THỦ CÔNG khi migrate fail** (đã dùng cho `0007_redundant_wild_pack` = cột `workflow_run.dryRun`):
  1. Chạy SQL trực tiếp, idempotent: `ALTER TABLE "..." ADD COLUMN IF NOT EXISTS "..." ...` (kèm `SET lock_timeout` để không treo nếu dev server đang giữ lock).
  2. Ghi record để `db:migrate` sau **bỏ qua** migration đó: `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($hash, $when)` với `hash = sha256(nội-dung-file .sql)` (`crypto.createHash('sha256').update(fs.readFileSync('drizzle/000N_xxx.sql')).digest('hex')`) và `$when` = `when` của entry trong `_journal.json`. Sau đó `db:migrate` exit 0 sạch.
- **Khuyến nghị:** session eval (chủ `db:push`) nên reconcile lại `__drizzle_migrations` cho gọn (bỏ record trùng) để tránh migrate fail về sau.
