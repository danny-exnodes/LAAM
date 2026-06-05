# Backlog: Chat — NÂNG CẤP TRẢI NGHIỆM NGƯỜI DÙNG (UX) (QA E2E 2026-06-05)

> ✅ **ĐÃ LÀM (code) 2026-06-05** — lead (`checkpoint/lead-2026-06-05.md`). UX-1/2/3/4/6/7 xong. UX-5 (chip "đang gọi tool" realtime): chỉ có map "đang dựng…" + "đang soạn…" trong lúc tool-loop; realtime per-tool cần SP-4 "trực-tiếp" (deferred — tool-loop non-stream). 540 test xanh, chưa commit.

> Nguồn: QA E2E feature Chat. Checkpoint: `.serena/checkpoint/qa-e2e-chat-2026-06-05.md`. Cải thiện trải nghiệm (không phải bug chặn).

---

## CHAT-UX-1 — Sample prompt nên auto-send (hoặc gợi ý rõ)  effort **S**
**Hiện trạng:** Click 1 trong 4 prompt mẫu chỉ **điền** ô nhập, không tự gửi → user tưởng hỏng/phải bấm thêm Gửi.
**Đề xuất:** Auto-send khi click prompt mẫu (demo 1-click đúng kỳ vọng), HOẶC thêm hint "Bấm Gửi để chạy".
**File:** `src/components/chat/ChatClient.tsx` (handler `setInput(t(key))` ở empty-state).

## CHAT-UX-2 — Thay `window.prompt` đính URL bằng input inline  effort **S**
**Hiện trạng:** Nút "Đọc một URL" dùng `window.prompt` native (`Composer.tsx:81-84`) — chặn luồng, không style, không dark mode.
**Đề xuất:** Popover/inline input trong composer (có validate URL, trạng thái loading).
**File:** `src/components/chat/Composer.tsx`.

## CHAT-UX-3 — Hiển thị tên model thật thay vì "Gemma"  effort **S**
(Góc UX của CHAT-U2.) Empty-state/placeholder nên show model động (qwen3…) lấy từ settings/`/api/chat/info` → luôn đúng sự thật, tăng tin cậy. Xem `chat-qa-ui-bugs.md#CHAT-U2`.

## CHAT-UX-4 — Logic nút "cuộn xuống đáy"  effort **S**
**Hiện trạng:** Nút chỉ hiện khi cuộn lên **>200px** (`ChatClient.tsx:108`) → chat ngắn gần như không bao giờ thấy nút (đã quan sát: cuộn lên đỉnh response ~300 từ vẫn dưới ngưỡng).
**Đề xuất:** Hiện nút khi **không ở đáy** + có nội dung mới đang stream (hạ ngưỡng / thêm điều kiện streaming).
**File:** `src/components/chat/ChatClient.tsx` (`onScroll`, `showScrollBtn`).

## CHAT-UX-5 — Trạng thái "đang gọi công cụ…"  effort **S**
**Bối cảnh:** Sau khi fix CHAT-F2 (tool-loop chạy thật), cần feedback khi model gọi tool (geo/connector) — tránh khoảng lặng.
**Đề xuất:** Hiện chip "đang gọi <tool>…" trong lúc tool-loop chạy (tận dụng frame `tool` của SP-4).
**File:** `src/components/chat/{ChatClient,ToolTrace}.tsx`.

## CHAT-UX-6 — Empty-state gợi ý hội thoại gần đây  effort **S**
**Đề xuất:** Ngoài 4 prompt mẫu, thêm "Tiếp tục gần đây" (vài conv mới nhất) để quay lại nhanh.
**File:** `src/components/chat/ChatClient.tsx` (empty-state).

## CHAT-UX-7 — Accessibility cho message actions  effort **S**
**Hiện trạng:** Trên desktop, action copy/sửa/regen/xoá là **hover-only** (trên mobile thì always-visible — tốt). Hover-only khó cho bàn phím/đọc màn hình.
**Đề xuất:** Cho hiện khi focus (keyboard) hoặc thêm menu "…"; đảm bảo focus ring + tab order.
**File:** `src/components/chat/MessageItem.tsx`.

---

### Ghi nhận tích cực (giữ nguyên)
Auto-scroll dính-đáy mượt; export dropdown đóng click-ngoài; responsive (drawer + bottom-nav mobile) tốt; dark/light ổn; i18n thân trang (vi/en) hoạt động; console **sạch hoàn toàn** suốt phiên; token count + timestamp hiển thị đúng; persistence reload chuẩn.
