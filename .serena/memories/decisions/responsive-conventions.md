# Decision: Responsive conventions (v2 UI)

Ngày: 2026-06-04. Chốt khi tinh chỉnh responsive toàn hệ thống.

## Quy ước
- **Breakpoint chính:** `md` (768px) là ngưỡng gập nav. `sm` (640px) là ngưỡng cho grid/padding chuyển từ mobile → rộng hơn.
- **Mobile nav = hamburger.** `app-header.tsx` là **client component** (`useState` open). Dưới `md`: ẩn nav ngang + actions, hiện nút ☰. Dropdown đặt `absolute top-full` (overlay) để **header giữ chiều cao ~56px** — không được dùng layout đẩy vì `/chat` tính `h-[calc(100dvh-var(--header-h,56px))]` phụ thuộc header 1 hàng. Link mobile tự đóng menu (`onClick`).
- **Padding trang:** dùng `p-4 sm:p-6` (không `p-6` cứng) cho mọi `<main>` shell.
- **Bảng dày / lưới nhiều cột** (heatmap 24 cột): bọc `overflow-x-auto` + `min-w-[…]` cho cuộn ngang thay vì bóp nát ô. recharts dùng `ResponsiveContainer` (đã chuẩn).
- **Cột nhãn cố định** (waterfall): thu nhỏ trên mobile bằng grid arbitrary responsive: `grid-cols-[minmax(5rem,7rem)_1fr] sm:grid-cols-[minmax(8rem,14rem)_1fr]`.
- **Input trong hàng filter:** `w-full sm:w-auto sm:flex-1` để full-width trên mobile, inline từ sm.
- Liên quan dark mode: vẫn theo [[v2-dark-mode-theming]] — media-query, không class `.dark`; CSS responsive thêm vào phải dùng media query thật.

## Chat mobile (mobile-app feel)
- **Sidebar hội thoại**: `sm+` là `<aside>` tĩnh; `<sm` ẩn → mở bằng nút (icon `PanelLeft`) trên top-bar → **drawer overlay** (`fixed inset-0`, panel `w-[84%] max-w-xs` + backdrop). Chọn hội thoại / "mới" tự đóng drawer. (Trước đây mobile KHÔNG có cách mở danh sách hội thoại.)
- **Safe-area**: composer `pb-[calc(0.75rem+env(safe-area-inset-bottom))]`; cần `viewport.viewportFit:"cover"` ở `layout.tsx` (nếu không env()=0). Áp dụng cho mọi thanh sát đáy.
- **Top-bar gọn**: nút có nhãn dài → icon-only `<sm`, hiện text `sm:inline` (vd nút Cài đặt = `SlidersHorizontal` trên mobile).
- Chuẩn test: iPhone 16 Pro Max = **440×956** CSS px.

## Liên quan
- Service [[v2-app]]. Header trước đây là server component (flex-wrap, không hamburger) → đã đổi sang client. Vào dev qua hostname/HTTPS proxy: xem [[auth-multihost-dev-env]] (cần `allowedDevOrigins` nếu không trang không hydrate).
