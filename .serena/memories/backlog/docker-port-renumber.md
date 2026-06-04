# Backlog: đổi cổng pg/adminer sang block 39xx (LÀM SAU)

> Hoãn theo yêu cầu user (2026-06-04). Production Docker đã chạy ổn ở `:3900`;
> đây chỉ là "dọn cổng cho gọn", KHÔNG khẩn cấp. Chi tiết: [[docker-deploy]],
> plan Task 10 `docs/superpowers/plans/2026-06-04-docker-stack-tailscale-funnel.md`.

## Hiện trạng (2026-06-04)
| Service | Cổng host hiện tại | Mục tiêu (39xx) |
|---|---|---|
| app (Docker, production) | **3900** ✅ đã đúng | 3900 |
| postgres | 5432 | **3932** |
| adminer | 8080 | **3980** |
| dev (host, KHÔNG Docker — user tự host) | 3100 | 3100 (giữ nguyên) |

App production đã ở 3900 nên phần còn lại chỉ là postgres 5432→3932, adminer 8080→3980.

## Ràng buộc QUAN TRỌNG
- Đổi cổng **published** của postgres KHÔNG ảnh hưởng container app (app nối DB nội
  bộ qua `postgres:5432`, không qua cổng host).
- NHƯNG **dev server 3100 của user nối DB qua cổng host** → nếu đổi 5432→3932 thì
  PHẢI cập nhật `DATABASE_URL` trong `.env` (hoặc env dev) sang `localhost:3932`,
  nếu không dev 3100 mất kết nối DB.
- ⇒ Phải xác nhận với user + biết dev 3100 đang dùng `DATABASE_URL` nào trước khi đổi.

## Các bước khi làm (gọn)
1. Sửa `docker-compose.yml`: `postgres` ports `5432:5432`→`3932:5432`; `adminer`
   `8080:8080`→`3980:8080`.
2. Cập nhật `.env` dev: `DATABASE_URL=...@localhost:3932/...` (gitignored, không commit).
3. `docker compose up -d` (recreate pg/adminer với cổng mới; volume `laam-v2-pg` giữ data).
4. Khởi động lại dev 3100 để áp env mới.
5. Verify: adminer ở `:3980`, dev 3100 + app Docker đều nối DB OK.

## Liên quan (cũng đang chờ, gói chung 1 lần cho tiện)
Bước cuối của plan còn: merge branch `infra/docker-stack` (worktree `LAAM-docker`)
vào main + chuyển compose `app` từ `image: laam-app:latest` sang `build: .` +
xoá worktree. Xem [[docker-deploy]].

## Xoá file này khi đã làm xong.
