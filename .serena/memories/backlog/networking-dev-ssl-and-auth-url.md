# Backlog (networking/infra session): SSL cho DEV + AUTH_URL phụ thuộc

Ngày tạo: 2026-06-04. Người tạo: session responsive (frontend). Giao cho: **session Docker/Tailscale (networking)**.

## Bối cảnh
- Có 2 cổng chạy SONG SONG, cố định:
  - **Docker production** (cổng riêng, env production) — session networking sở hữu.
  - **Dev** `npm run dev` trên **:3100** (đã ghim `next dev -p 3100` trong package.json), user tự host, truy cập qua MagicDNS `danny-gaming-pc.tail41dda4.ts.net:3100` (hiện **HTTP**).
- User cần **HTTPS cho DEV** vì một số function của trình duyệt là *secure-context-only* (geolocation cho `/api/geocode`, clipboard, `crypto.subtle`, camera…): trên `localhost` HTTP vẫn chạy, nhưng qua **hostname** thì HTTP bị chặn → phải HTTPS.

## Việc cần làm (networking session)
1. Cấp **HTTPS cho dev** qua **Tailscale Serve** (khuyến nghị — cert Let's Encrypt thật cho tên ts.net, tin cậy trên mọi thiết bị tailnet, không cảnh báo). Ví dụ:
   `tailscale serve --bg --https=8443 http://127.0.0.1:3100` → truy cập `https://danny-gaming-pc.tail41dda4.ts.net:8443`.
   - **Tránh đụng cổng với prod funnel**: prod nên giữ `:443` (funnel public), dev dùng cổng HTTPS khác (vd `:8443`, tailnet-only — KHÔNG funnel ra public). Serve & Funnel dùng chung serve-config nên cần phân cổng rõ ràng.
2. Quyết định **URL HTTPS cuối cùng của dev** (scheme+host+port). Báo lại cho session responsive/frontend.

## ⚠️ Phụ thuộc chéo — AUTH_URL (frontend sẽ chỉnh, ĐỪNG hai bên cùng sửa)
- Auth.js v5: **Edge middleware bỏ qua Host header** (kể cả x-forwarded-host) → origin = `localhost` khi vào bằng hostname khác. Lever tin cậy = **`AUTH_URL`**. Tailscale Serve đặt `x-forwarded-proto=https`/`x-forwarded-host` (route handler Node nhận đúng — đã verify), nhưng **middleware vẫn cần AUTH_URL**. Xem [[auth-multihost-dev-env]].
- Dev AUTH_URL nằm ở **`.env.development.local`** (dev-only, gitignored; prod KHÔNG đọc). Hiện = `http://danny-gaming-pc.tail41dda4.ts.net:3100`.
- **Khi networking chốt URL HTTPS dev → báo session frontend**; frontend sẽ set `AUTH_URL` (dev) = đúng URL đó:
  - serve `:8443` → `AUTH_URL=https://danny-gaming-pc.tail41dda4.ts.net:8443`
  - serve `:443` (không port) → `AUTH_URL=https://danny-gaming-pc.tail41dda4.ts.net`
  - AUTH_URL phải KHỚP TUYỆT ĐỐI URL trên thanh địa chỉ, nếu không login lại vỡ.
- **Prod**: AUTH_URL của prod set ở env production (compose/`.env.production`), = URL funnel HTTPS công khai — networking session sở hữu, độc lập với file dev.

## Trạng thái hiện tại (frontend đã làm)
- `.env.development.local` (AUTH_URL http :3100) + `package.json` dev ghim `-p 3100`. Login qua HTTP :3100 đã sửa (chờ verify sau restart). SSL là lớp tiếp theo, chờ networking.

---

## ✅ DONE (networking session) — 2026-06-04

**Đã dựng HTTPS cho dev qua Tailscale Serve, tailnet-only, không đụng Funnel prod.**

- Lệnh đã chạy (persistent, sống qua reboot): `tailscale serve --bg --https=8443 http://127.0.0.1:3100`
- **URL HTTPS cuối cùng của dev (CHỐT):** `https://danny-gaming-pc.tail41dda4.ts.net:8443`
  - **tailnet-only** (KHÔNG public — `tailscale funnel status` gắn nhãn "(tailnet only)").
  - Cert Let's Encrypt thật cho tên ts.net → tin cậy trên thiết bị tailnet, không cảnh báo.
  - Verified: `/login` → **200** qua HTTPS, có `_next/static` (secure context OK).
- **Prod Funnel KHÔNG đổi:** `:443 → 127.0.0.1:3900` vẫn public, vẫn 200 (đã verify lại). Hai cổng phân tách rõ: `443`=prod funnel, `8443`=dev serve.
- Rollback nếu cần: `tailscale serve --https=8443 off`.

### 👉 ACTION cho session frontend (AUTH_URL — networking KHÔNG sửa)
Đặt trong `.env.development.local` (dev-only, gitignored) rồi **restart `npm run dev`**:
```
AUTH_URL=https://danny-gaming-pc.tail41dda4.ts.net:8443
```
- Phải KHỚP TUYỆT ĐỐI URL gõ trên trình duyệt (`https` + host + `:8443`), nếu không lỗi origin=localhost tái diễn ([[auth-multihost-dev-env]]).
- Lưu ý: secure-context (geolocation/clipboard/crypto.subtle) **chạy ngay** khi vào dev qua `:8443`. Nhưng **LOGIN** qua `:8443` chỉ đúng sau khi set AUTH_URL trên + restart.
- AUTH_URL pin 1 origin: sau khi đổi sang `:8443`, vào dev nên dùng `:8443` (không dùng `:3100` HTTP nữa để tránh redirect chéo).

→ Khi frontend set xong + verify login qua `:8443`, có thể **xoá file backlog này** (việc đã đóng cả hai phía).
