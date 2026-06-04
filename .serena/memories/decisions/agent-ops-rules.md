# Rule: KHÔNG tự ý chạy ngầm service

Ngày: 2026-06-04. Yêu cầu trực tiếp của user (chủ dự án).

## Quy tắc (bắt buộc, mọi agent)
- **TUYỆT ĐỐI KHÔNG tự ý khởi động / chạy ngầm bất cứ service nào** nếu chưa có sự cho phép rõ ràng của user. Gồm: `npm run dev`, `npm run start`, `next dev/start`, `docker compose up`, Ollama serve, preview dev server, hay bất kỳ tiến trình long-running / background nào.
- User **tự host dev server** (vd `npm run dev`). Việc dựng/chạy server là của user, không phải agent.
- Nếu cần verify trực quan: **hỏi xin phép trước**, hoặc đề xuất lệnh để user tự chạy. Được phép chạy lệnh **ngắn, không trú ngụ** (test, tsc, build *khi được phép*) nhưng không để service chạy nền.
- `next start` (prod) phục vụ từ `.next` đang có — **không chạy `npm run build` in-place khi server prod đang chạy** (ghi đè `.next` → vỡ server). Build cần khi server dừng hoặc trong worktree riêng.

## Bối cảnh
- :3000 từng chạy `npm run start` (next start, prod, PID 5968) — user yêu cầu kill để tự host lại bằng dev. Đã kill cả chuỗi npm→cmd→next, :3000 trống.
