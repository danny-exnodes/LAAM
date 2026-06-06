# Decision/Discovery: Auth.js origin = localhost khi truy cập qua hostname khác; tách env dev

> **⚠️ ACCESS URL — bắt buộc (user xác nhận 2026-06-06):** truy cập dev server qua
> **`https://danny-gaming-pc.tail41dda4.ts.net:8443`** (Tailscale Serve HTTPS, tailnet-only).
> **KHÔNG dùng `localhost:3100`/`:3000`** — **Tailscale chặn** (và `AUTH_URL` pin ts.net:8443
> nên localhost cũng lệch origin → login đá về). Dùng URL này cho E2E / mở trình duyệt.

Ngày: 2026-06-04. Phát hiện khi user không login được qua `danny-gaming-pc.tail41dda4.ts.net:3100` (dev), trong khi `localhost` ổn.

## Triệu chứng & root cause (đã reproduce bằng curl trên tailnet)
- Đăng nhập qua **localhost:3100** → `302 → localhost:3100/dashboard` ✅.
- Đăng nhập qua **ts.net:3100** → `302 → http://localhost:3100` ❌. Auth.js từ chối callbackUrl ts.net (khác origin với base) rồi rơi về **localhost**.
- Middleware (Edge) redirect đúng host nhưng **nhúng `callbackUrl=http://localhost:3100/...`**.
- Kiểm chứng cookie `authjs.callback-url`: route handler (Node) đọc đúng `Host`/`x-forwarded-host`; **Edge middleware (`src/proxy.ts`) LUÔN trả `localhost:3100`** — bỏ qua cả `Host` lẫn `x-forwarded-host`, dù `trustHost:true`.
- ⇒ Cookie phiên set đúng cho ts.net nhưng trình duyệt bị đẩy về `localhost` → máy khác không tới được / cùng máy thì khác origin = mất cookie → "không login được". KHÔNG phải lỗi cookie Secure (cookie HTTP bình thường), KHÔNG có AUTH_URL/NEXTAUTH_URL trong env (mọi scope rỗng).

## Khắc phục: tách env theo môi trường (Next.js load order)
- `next dev` (NODE_ENV=development) nạp: `.env.development.local` > `.env.local` > `.env.development` > `.env`.
- `next build`/`next start` (production, Docker session kia) **KHÔNG** đọc `.env.development*`.
- → Đặt `AUTH_URL` (đúng scheme+host+port gõ trên trình duyệt) vào **`.env.development.local`** (gitignored, dev-only, local-only). Prod Docker không bị ảnh hưởng; không tách nhánh; không đụng session networking.
- File hiện tại: `AUTH_URL=http://danny-gaming-pc.tail41dda4.ts.net:3100`. **Phải restart `npm run dev`** mới có hiệu lực (Next không hot-reload env).
- ⚠️ KHÔNG để dev-AUTH_URL trong `.env.local` (file đó nạp cả ở production).
- ⚠️ `AUTH_URL` pin 1 origin: vào dev bằng `localhost` sẽ bị đổi sang ts.net sau login (chấp nhận khi dev 1 máy). Nếu sau dùng Tailscale Funnel (HTTPS, không port) thì prod cần `AUTH_URL=https://danny-gaming-pc.tail41dda4.ts.net` ở env production (việc của session funnel).

## Kiến trúc 2 cổng song song (user xác nhận)
- Docker **production** (`:443` funnel public → `127.0.0.1:3900`) — session Docker/Tailscale lo.
- Dev `npm run dev` **:3100** local, **truy cập qua HTTPS Tailscale Serve `:8443`** (`tailscale serve --bg --https=8443 http://127.0.0.1:3100`, tailnet-only, cert thật). User tự host.
- `.env.development.local`: `AUTH_URL=https://danny-gaming-pc.tail41dda4.ts.net:8443` (khớp URL trình duyệt). `package.json` dev ghim `-p 3100`.
- Liên quan: [[auth-and-proxy]] (trustHost), service [[v2-app]], [[laam-dev-server-self-hosted]].

## ⚠️ GOTCHA 2 (đã sửa): hydrate hỏng khi vào dev qua proxy cross-origin → login "đá về"
Ngày 2026-06-04. Sau khi SSL :8443 chạy, login vẫn đá về /login. Reproduce bằng Chrome DevTools trên host:
- Bấm "Đăng nhập" → URL nhảy thành `/login?email=…&password=…` = **form submit GET nguyên thủy** (React `onSubmit`/preventDefault KHÔNG chạy). DOM không có `__reactFiber` → **trang client KHÔNG hydrate**.
- Mọi chunk JS tải OK (304), React runtime chạy, **không lỗi runtime** — chỉ **HMR WebSocket 502** (`wss://…:8443/_next/webpack-hmr`).
- **Nguyên nhân:** Next.js 16 mặc định **chặn dev-only endpoints khi cross-origin**. Hostname Tailscale ≠ `localhost` (host dev khởi tạo) → chặn HMR endpoint → client Turbopack không bootstrap xong → không hydrate → form về GET → đá về login. (Tài liệu: `allowedDevOrigins`.)
- **FIX:** `next.config.ts` → `allowedDevOrigins: ["danny-gaming-pc.tail41dda4.ts.net"]`. **Dev-only** (`next build`/`start` bỏ qua → không đụng Docker prod). **Phải restart `npm run dev`.** Verified: sau restart, login qua :8443 vào thẳng /dashboard.
- **Bài học chung:** truy cập `next dev` qua BẤT KỲ proxy/hostname khác localhost (Tailscale, ngrok, LAN IP) → phải thêm host đó vào `allowedDevOrigins`, nếu không trang không hydrate (mọi form/nút client "chết", không chỉ login).
- ⚠️ Side-effect bảo mật của bug: GET submit đẩy password vào URL/lịch sử → nhắc user xoá lịch sử + cân nhắc đổi mật khẩu test.
