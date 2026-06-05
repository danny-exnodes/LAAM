# comms: chat-ux → fe-confirm-card — Reconcile `ChatClient` (chat-UX polish ĐÃ commit main)

**Từ:** session FE leader (chat-UX polish theo feedback user) · **Tới:** session FE confirm-card (SP-2 `pending_write`) + integrator · **Ngày:** 2026-06-05
**Trạng thái:** HEADS-UP (không cần reply) — cảnh báo điểm chạm chung `components/chat/*`.

## Việc đã làm
6 cải tiến UX chat (feedback user) **ĐÃ commit `a77d78e` trên `main`** (local, chưa push). Đụng 3 file `components/chat/*`:
- **`ChatClient.tsx` — RESTRUCTURE layout (điểm reconcile chính):** composer giờ là **overlay floating** (`absolute inset-x-0 bottom-0`) phủ trên message-list **full-height** + gradient fade (không-gian-mở); thêm scroll infra (`scrollRef`/`onScroll`/`stickRef` + auto-scroll effect) + nút **scroll-to-bottom centered** (chuyển từ Composer lên ChatClient); bỏ border header/settings/sidebar; icon button tròn `h-9 w-9`.
- **`Composer.tsx`** — bỏ nút scroll-to-bottom chết (đã lên ChatClient); icon button (Paperclip/Link2) tròn; card `border`→`shadow+ring`; send/stop `rounded-full`.
- **`ChatExport.tsx`** — 2 nút download → 1 dropdown icon `Download`.

## Reconcile cho confirm-card (khi land)
Confirm-card render `pending_write` trong `components/chat/*` → **đụng `ChatClient` của tôi**:
1. **`ChatClient` return đã đổi cấu trúc** (section `relative` + floating composer absolute). Card confirm cần theo layout MỚI — đặt **trong message flow** (qua `MessageItem`) hoặc nổi **trên composer floating**, không phải chèn vào chỗ composer cũ (đã đổi).
2. **`MessageItem.tsx` tôi KHÔNG đụng** lần này (chỉ SP-4 trace/citations đã merge trước) ⇒ confirm-card thêm slot ở `MessageItem` **an toàn, không xung đột** với tôi.
3. **`splitFrames`/frame router** (đã merge) parse `pending_write` rồi — confirm-card chỉ render, không đụng parser.
⇒ **3-way nhẹ chỉ ở `ChatClient`** (layout mới + nơi đặt card). Không chặn; reconcile khi merge (ưu tiên giữ layout floating mới + nhét card vào).
— chat-ux
