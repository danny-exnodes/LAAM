# Decision: DB schema bằng MIGRATION (không db:push)

Ngày: 2026-06-03.

**Quyết định:** Mọi thay đổi schema v2 dùng **migration versioned**:
`npm run db:generate` (sinh SQL trong `drizzle/`, **commit**) → `npm run db:migrate`.
KHÔNG dùng `db:push` khi đã có dữ liệu (push chỉ additive-safe lúc prototype; có thể hỏi drop khi diff phức tạp → mất data).

**Baseline:** DB ban đầu tạo bằng push; đã reset sạch (`docker compose down -v`) rồi generate+migrate để có baseline migration-managed (data lúc đó chỉ là test, session re-sync được bằng nút Đồng bộ).

**Lưu ý vận hành quan trọng:** `drizzle-kit` cần `esbuild` → **KHÔNG chạy được trong sandbox của agent** (esbuild binary bị chặn tải qua network allowlist). Vì vậy **migration phải generate trên máy dev** (macOS chạy bình thường). Khi agent đổi schema → báo user chạy `db:generate` + `db:migrate`, không tự generate trong sandbox.
