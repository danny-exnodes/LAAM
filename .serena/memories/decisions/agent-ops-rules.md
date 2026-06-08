# Rule: KHÔNG tự ý chạy ngầm service

Ngày: 2026-06-04. Yêu cầu trực tiếp của user (chủ dự án).

## Quy tắc (bắt buộc, mọi agent)
- **TUYỆT ĐỐI KHÔNG tự ý khởi động / chạy ngầm bất cứ service nào** nếu chưa có sự cho phép rõ ràng của user. Gồm: `npm run dev`, `npm run start`, `next dev/start`, `docker compose up`, Ollama serve, preview dev server, hay bất kỳ tiến trình long-running / background nào.
- User **tự host dev server** (vd `npm run dev`). Việc dựng/chạy server là của user, không phải agent.
- Nếu cần verify trực quan: **hỏi xin phép trước**, hoặc đề xuất lệnh để user tự chạy. Được phép chạy lệnh **ngắn, không trú ngụ** (test, tsc, build *khi được phép*) nhưng không để service chạy nền.
- `next start` (prod) phục vụ từ `.next` đang có — **không chạy `npm run build` in-place khi server prod đang chạy** (ghi đè `.next` → vỡ server). Build cần khi server dừng hoặc trong worktree riêng.

## Bối cảnh
- :3000 từng chạy `npm run start` (next start, prod, PID 5968) — user yêu cầu kill để tự host lại bằng dev. Đã kill cả chuỗi npm→cmd→next, :3000 trống.

---

## Quy tắc — Git isolation khi đội khác đang làm TRỰC TIẾP trên `main`

Ngày: 2026-06-08. Yêu cầu trực tiếp của user (sau khi agent lỡ `checkout -b` trên main đang có đội khác làm).

- ⛔ **KHÔNG tự `git checkout -b <branch>` / đổi branch trên working dir đang ở `main`** (hay branch chia sẻ) khi có khả năng đội khác đang làm trực tiếp trên đó. `checkout -b` kéo **working dir CHUNG** rời khỏi main → **phá việc của đội đang ở main**.
- ✅ Thay vào đó: (1) **CẢNH BÁO user trước**; (2) dùng **`git worktree add <path> -b <branch>`** → tạo **thư mục riêng** để cô lập, working dir main **giữ nguyên trên main**.
- Không tự ý tạo/đổi branch của working dir chung mà chưa flag cho user.
- Phạm vi: luật này về **đổi branch của working dir CHUNG**. Docs/Serena vẫn theo convention repo (commit thẳng main được).
