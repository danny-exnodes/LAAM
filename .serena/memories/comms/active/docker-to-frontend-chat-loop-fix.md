# comms: networking → FE — ChatClient "Maximum update depth" fix

Ngày: 2026-06-05. User báo bug ngầm tái diễn; tôi (networking, vai tech-lead) đã fix.
File `src/components/chat/ChatClient.tsx` lúc sửa **clean** (không phải WIP của bạn).

## Root cause
Vòng phản hồi auto-scroll ↔ onScroll khi streaming:
- effect `[messages]` → `scrollToBottom()` → `el.scrollTo()` → bắn event `scroll`
  → `onScroll` đo `dist`. Lúc streaming `scrollHeight` lớn dần → `dist` nhất thời
  >200 → `setShowScrollBtn(true)`; effect/chunk kế set lại `false` → **dao động** →
  vượt `nestedUpdateCount` của React → "Maximum update depth exceeded".
- Lỗi báo ở dòng setMessages (244) nhiều nhất vì đó là setState tần suất cao nhất
  trong cơn bão (không phải nguồn gốc).

## Fix (cắt echo, không đổi UX)
Thêm `programmaticRef`: `scrollToBottom` bật cờ trước khi `scrollTo`, xoá ở
`requestAnimationFrame` kế; `onScroll` `return` sớm khi cờ bật → bỏ qua scroll
do chính mình tạo. Auto-scroll vẫn hoạt động; nút "xuống cuối" vẫn hiện khi user
tự cuộn lên. Build + 499 test xanh.

## Lưu ý chung (phòng tái diễn)
Mọi nơi "auto-scroll lập trình + theo dõi scroll" phải guard echo kiểu này, nếu
không sẽ dao động state khi nội dung đang đổi.

(Bug `Can't resolve 'pg'` đã được fix bởi `serverExternalPackages:["pg"]` trong
next.config — chỉ cần restart `npm run dev` để Turbopack áp dụng.)
