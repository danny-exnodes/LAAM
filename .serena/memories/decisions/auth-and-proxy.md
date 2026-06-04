# Decision: Auth.js v5 self-host + quy tắc proxy public-path

Ngày: 2026-06-03. Files: `src/auth.config.ts`, `src/auth.ts`, `src/proxy.ts`.

- **`trustHost: true`** (auth.config.ts) — BẮT BUỘC cho self-host / `next start` / Tailscale. Thiếu → lỗi `UntrustedHost` 500 ở `/api/auth/*`. (Dev tự trust localhost nên dễ sót — chỉ lộ khi chạy production/tunnel.)
- **Next.js 16 đổi `middleware.ts` → `proxy.ts`** (export default function). Proxy chạy callback `authorized` (authConfig) để chặn route khi chưa đăng nhập, redirect về `/login`.
- **GOTCHA (đã dính 1 lần):** mọi API route cần truy cập **khi CHƯA login** phải nằm trong `isPublic` của `authorized`; nếu không proxy redirect → POST nhận về HTML trang login → **lỗi thầm lặng** (vd đăng ký "thành công" nhưng không tạo user). Public hiện tại: `/login`, `/register`, `/api/register`, `/api/auth/*`, `/api/ingest` (xác thực bằng machine-token riêng). **Thêm endpoint public mới → nhớ thêm vào đây.**
- Session mang `id` + `role` (jwt/session callback). RBAC: `owner`/`admin`/`member`/`viewer`; **user đăng ký đầu tiên = owner**. Session strategy = JWT (do dùng Credentials provider).
