# Backlog: Chat — LỖI GIAO DIỆN (QA E2E 2026-06-05)

> ✅ **ĐÃ FIX (code) 2026-06-05** — lead (`checkpoint/lead-2026-06-05.md`). U1 (relative), U2 (model động), U3 (i18n header), U-minor (skeleton) xong. 540 test xanh, tsc sạch, **chưa commit**. Cần xem lại layout trực quan trên trình duyệt (lead không tự chạy dev server).

> Nguồn: QA E2E feature Chat trên production bằng Claude in Chrome. Checkpoint: `.serena/checkpoint/qa-e2e-chat-2026-06-05.md`.

---

## CHAT-U1 — Composer floating lệch + tràn dưới sidebar  🔴 Cao · effort **S (1 dòng)**
**Triệu chứng:** Ô soạn tin (composer) KHÔNG thẳng hàng với cột tin nhắn; lệch hẳn sang trái. Ở **light mode** thấy rõ thanh nền trắng của composer đè xuống đáy sidebar.
**Bằng chứng (đo DOM, viewport 1424):**
```
section:          left=288, center=849, position: STATIC   ← thủ phạm
messageColumn:    left=465, center=849
composerAbsWrap:  left=0,   center=705, width=1409 (full viewport)
nearest positioned ancestor of composer = none (= viewport)
```
⇒ composer center **705** vs message center **849** = **lệch 144px trái**; wrapper rộng cả viewport (phủ dưới sidebar 288px).
**Nguyên nhân gốc:** `<section>` bọc vùng chat đang `position: static`, nên composer `absolute inset-x-0 bottom-0` (`ChatClient.tsx:523`) neo theo **viewport** thay vì section. `inset-x-0` → trải full-width; `mx-auto max-w-3xl` bên trong căn giữa theo viewport (705) chứ không theo cột chat (849). Ảnh hưởng **cả 2 theme** (dark chỉ che vệt màu, lệch vị trí vẫn còn).
**Đề xuất sửa:** Thêm class `relative` vào `<section className="flex min-w-0 flex-1 flex-col">` tại **`ChatClient.tsx:454`**. Sau đó `inset-x-0` neo theo section (left=288, center=849) → composer thẳng cột message + không tràn sidebar.
**Nghiệm thu:** composer center ≈ message center (±4px) ở 2 theme; thanh nền không đè sidebar (check light mode); responsive mobile vẫn full-width đúng.
**File:** `src/components/chat/ChatClient.tsx:454`.

---

## CHAT-U2 — Branding "Gemma" sai (model thật là Qwen3)  🟡 TB · effort **S**
**Triệu chứng:** Empty-state ghi "mô hình **Gemma** chạy cục bộ"; placeholder ô nhập "Nhắn cho **Gemma**…". Model deploy thực tế = `qwen3-vl:8b-instruct-q8_0` (đã verify trong panel "Cài đặt mô hình").
**Bằng chứng:** Ở EN placeholder vẫn "Message **Gemma**…" ⇒ "Gemma" nằm trong **cả 3 dict** (vi/en/zh), không phải runtime.
**Đề xuất sửa:** Bỏ hardcode "Gemma". Tốt nhất: hiển thị **tên model động** (lấy từ `/api/chat/info` / settings.model — picker đã biết) để luôn đúng khi đổi model. Tối thiểu: sửa chuỗi trong dict thành trung tính ("mô hình cục bộ").
**Nghiệm thu:** Empty-state + placeholder không còn chữ "Gemma"; phản ánh đúng model hiện hành ở cả vi/en/zh.
**File:** `src/i18n/dictionaries/chat.ts` (keys empty-state + `inputPh`), tùy chọn `src/components/chat/{ChatClient,Composer}.tsx` để chèn tên model động. (Liên quan: `types.ts:56` `DEFAULT_SETTINGS.model="gemma4:e4b"` cũng nên đổi cho khớp — dù runtime đã override bằng `/api/chat/info`.)

---

## CHAT-U3 — Nút header dùng chung không i18n  🟡 TB · effort **S**
**Triệu chứng:** Khi đổi ngôn ngữ sang EN, các nút trên header vẫn **tiếng Việt**: "Giao diện: Hệ thống" (theme), "Đồng bộ" (sync), "Tài khoản" (account).
**Bằng chứng:** read_page ở chế độ EN: `button "Giao diện: Hệ thống"`, `button "Đồng bộ"`, `button "Tài khoản"` (aria-label tiếng Việt).
**Nguyên nhân:** Component header dùng chung chưa nối `useT` (hardcode vi). Khớp ghi chú INDEX "trang cũ vẫn hardcode vi — swap dần".
**Đề xuất sửa:** Nối các label/aria-label header sang `useT`, thêm key vào dict **cả 3 ngôn ngữ** (vi/en/zh). (Tìm file: grep chuỗi `"Giao diện:"` / `"Đồng bộ"` / `"Tài khoản"` — nhiều khả năng `src/components/AppHeader*.tsx` hoặc layout header.)
**Nghiệm thu:** Đổi EN/中 → theme/sync/account đổi ngôn ngữ tương ứng.
**File:** header dùng chung (cần grep xác định) + `src/i18n/dictionaries/*`.

---

### Minor (🟢 Thấp)
- **Nháy "Chưa có cuộc trò chuyện nào"** thoáng qua trước khi `loadConvs()` xong (race lúc mount). Cân nhắc skeleton/loading state cho sidebar. File: `ChatClient.tsx` + `ConversationSidebar.tsx`.
