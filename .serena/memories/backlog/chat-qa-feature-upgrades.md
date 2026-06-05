# Backlog: Chat — NÂNG CẤP / BUILD THÊM TÍNH NĂNG (QA E2E 2026-06-05)

> ✅ **ĐÃ LÀM (code) 2026-06-05** — lead (`checkpoint/lead-2026-06-05.md`). FEAT-1 (group/bulk/pin-localStorage/content-search), FEAT-2 (proactive card + env threshold), FEAT-3 (PDF+copy-all+token total), FEAT-4 (OCR soft + chip preview), FEAT-5 (`demo_create_task` write-gate không cần credential, doc `docs/demo-connector-write-gate.md`). 540 test xanh, chưa commit. Lưu ý: pin = **localStorage** (không migration); content-search = `/api/conversations?q=`.

> Nguồn: QA E2E feature Chat. Checkpoint: `.serena/checkpoint/qa-e2e-chat-2026-06-05.md`. Đây là đề xuất tính năng (không phải bug) — ưu tiên sau khi xử lý bug ở `chat-qa-functional-bugs.md` / `chat-qa-ui-bugs.md`.

---

## CHAT-FEAT-1 — Quản lý hội thoại nâng cao  effort **M**
**Bối cảnh:** Sidebar hiện chỉ có list + search theo title + rename + delete từng cái. Dữ liệu thật có **rất nhiều conv trùng** ("Vẽ biểu đồ…", "Tìm quán cà phê…" lặp nhiều lần).
**Đề xuất:** (a) Xoá hàng loạt / chọn nhiều; (b) Ghim/yêu thích; (c) Nhóm theo thời gian (Hôm nay / Hôm qua / 7 ngày…); (d) Khử trùng lặp hoặc cảnh báo; (e) **Search cả nội dung tin nhắn**, không chỉ title.
**Nghiệm thu:** chọn-xoá nhiều conv 1 lần; ghim nổi lên đầu; search "lịch sử Hà Nội" tìm được conv theo nội dung.
**File:** `src/components/chat/ConversationSidebar.tsx`, `src/app/api/conversations/*`.

## CHAT-FEAT-2 — Proactive (SP-3) thành card riêng + cấu hình  effort **M**
**Bối cảnh:** Alert proactive ("Agent LAAM đang kẹt (71') và chi phí cao ($39.15)") **được nhét vào cuối câu trả lời** của model → đọc như model tự nói; xuất hiện có điều kiện (tốt, không spam mọi tin).
**Đề xuất:** Tách alert thành **card/banner riêng** (UI phân biệt rõ là cảnh báo hệ thống), có nút **dismiss** và **cấu hình ngưỡng** (stuck phút / cost $). Xác minh số liệu lấy từ internal-tool thật (agent_sessions/stats), không phải model bịa (Rule 13).
**Nghiệm thu:** alert hiện dạng card tách biệt, dismiss được, ngưỡng chỉnh được; số khớp dữ liệu monitoring.
**File:** `src/lib/chat/*` (buildSystemPrompt/proactive), `src/components/chat/*` (card mới).

## CHAT-FEAT-3 — Export PDF + copy-all; tổng token/cost theo conv  effort **S–M**
**Bối cảnh:** Export hiện chỉ MD/JSON. Token count có per-message (vd "201 vào · 193 ra") nhưng không có tổng.
**Đề xuất:** (a) Thêm **Export PDF** (jsPDF đã có trong deps) + "Copy cả hội thoại"; (b) Hiển thị **tổng token + ước tính chi phí** theo conversation (footer hoặc panel).
**Nghiệm thu:** export ra PDF đọc được; thấy tổng token/cost của conv.
**File:** `src/components/chat/ChatExport.tsx`, `src/lib/export/*`.

## CHAT-FEAT-4 — Panel quản lý đính kèm + xử lý OCR-unavailable mềm mại  effort **S–M**
**Bối cảnh:** Đính kèm hiện là chip đơn giản; OCR chết thì user chỉ biết SAU khi upload (xem CHAT-F3). 
**Đề xuất:** (a) Panel xem trước/quản lý nhiều đính kèm (tên, số ký tự, xoá, xem nội dung trích); (b) Khi OCR không khả dụng → **ẩn/disable nút đính ảnh + tooltip "OCR chưa cài"** ngay từ đầu thay vì để fail.
**Nghiệm thu:** thấy preview đính kèm; nút ảnh disable khi thiếu OCR với lý do rõ ràng.
**File:** `src/components/chat/Composer.tsx`, `ChatClient.tsx`, `src/app/api/ocr` (trả flag available).

## CHAT-FEAT-5 — Demo end-to-end Connector Write-Gate (Confirm Card)  effort **M**
**Bối cảnh:** SP-2 Confirm-Card + SP-4 tool-trace/citations đã build nhưng **chưa test được** (không có connector cấu hình; không tool-call nào nổ).
**Đề xuất:** Tạo đường demo: cấu hình 1 connector (vd Trello `trello_create_card`) → prompt khiến model đề xuất write → hiện **Confirm Card** → Xác nhận → execute + stream + tool-trace. Dùng làm cả QA fixture.
**Nghiệm thu:** flow write-gate chạy thật (card hiện → xác nhận → tạo card → trace ✓); huỷ → "Đã huỷ".
**File:** `src/lib/connectors/*`, `src/app/api/chat/route.ts`, `src/components/chat/{ConfirmCard,ToolTrace,Citations}.tsx`.
**Liên quan:** [[agent-harness-sp2-fe-confirm]].
