# Backlog: Chat — LỖI TÍNH NĂNG (QA E2E 2026-06-05)

> ✅ **ĐÃ FIX (code) 2026-06-05** — lead (`checkpoint/lead-2026-06-05.md`). F1/F2/F3/F4 xong, 540 test xanh, tsc sạch, **chưa commit**. Còn lại = **runtime-verify**: F2 cần model qwen3 thực sự emit ```chart/```map (đã dạy prompt + client geo-resolve); F3 cần chạy Docker (đã bake tesseract) hoặc cài native; abort-stream chưa test; confirm-card nay test được qua connector Demo (FEAT-5).

> Nguồn: QA E2E feature Chat trên **production** (`https://danny-gaming-pc.tail41dda4.ts.net`) bằng Claude in Chrome, model `qwen3-vl:8b-instruct-q8_0`. Checkpoint: `.serena/checkpoint/qa-e2e-chat-2026-06-05.md`.
> Ưu tiên tổng: **U1 → F1 → F2 → F3 → U2/U3** (xem thêm `chat-qa-ui-bugs.md`).

---

## CHAT-F1 — Slash command "chết" (chỉ `/dung` chạy)  🔴 Cao · effort **S**
**Triệu chứng:** Gõ `/` mở menu 5 lệnh (`/moi /xoa /dung /xuat /caidat`). Chọn hoặc Enter `/moi`, `/xoa`, `/xuat`, `/caidat` chỉ **xoá ô nhập**, KHÔNG thực thi hành động.
**Repro (verified live):** Trong hội thoại đang có tin nhắn → gõ `/moi`↵ → ô nhập trống nhưng hội thoại cũ **vẫn nguyên** (không tạo conv mới). Đối chiếu: nút **"+ Mới"** tạo conv mới đúng → nghịch lý người dùng.
**Nguyên nhân gốc:** `src/components/chat/Composer.tsx:61-66` — `pickCommand()` chỉ map `dung`→`onStop`; 4 lệnh còn lại rơi vào `onChange("")`. Handler thật (`newConv`/clear/export/settings-toggle) nằm ở `ChatClient` nhưng **không truyền xuống** Composer. Danh sách lệnh: `Composer.tsx:17-23`.
**Đề xuất sửa:** Thêm props cho Composer: `onNew`, `onClear`, `onExport`, `onToggleSettings`. ChatClient đã có sẵn `newConv` (→ /moi và /xoa có thể = newConv vì conv hiện chưa có "clear nội dung giữ conv"), `setSettingsOpen` (→ /caidat), và ChatExport (→ /xuat, cần lift trigger). Map trong `pickCommand`.
**Nghiệm thu:** `/moi`→conv mới · `/xoa`→xoá nội dung conv hiện tại · `/caidat`→mở panel settings · `/xuat`→kích export · `/dung`→stop (giữ). Có unit test cho từng lệnh.
**File:** `src/components/chat/Composer.tsx`, `src/components/chat/ChatClient.tsx`.

---

## CHAT-F2 — Chart/Map KHÔNG render (rich-render & geo-tool không kích hoạt)  🔴 Cao · effort **M–L**
**Triệu chứng:** 4 prompt mẫu trưng bày (chart / chỉ đường / quanh đây / thời tiết) đều trả **text thường**, không có chart/map.
**Repro (verified live):**
- "Vẽ biểu đồ cột doanh thu 4 quý: 12,19,9,15" → **ASCII art** (không phải recharts `ChartBlock`).
- "Chỉ đường từ Hồ Gươm tới Văn Miếu" → **text mô tả** (không phải `LeafletMap`).
**Bằng chứng (network):** Khi gửi prompt chỉ đường, **0 request** tới `/api/geocode | /api/route | /api/nearby`. Chỉ có `POST /api/chat` + `GET /api/conversations`. ⇒ Model không gọi geo-tool, cũng không emit fenced block ```chart/```map.
**Nguyên nhân (giả thuyết — cần xác nhận trong code):**
1. `buildSystemPrompt` không dạy model emit format ` ```chart {json} ` / ` ```map {json} ` mà `MarkdownView`/`ChartBlock`/`MapBlock` cần để render.
2. Geo-endpoint (`/api/geocode|route|nearby`) **không** được đăng ký làm model-tool trong tool-loop `/api/chat` (loop hiện chỉ chứa connector-tool — xem Wave 4).
**Đề xuất sửa (1 hoặc cả 2):** (a) Few-shot trong system prompt với ví dụ output fenced chart/map; (b) Đăng ký geo-endpoint thành tool trong tool-loop → model gọi → data → render. Bật **tool-trace + citations** (SP-4 đã có hạ tầng) để người dùng thấy.
**Nghiệm thu:** prompt chart → ChartBlock thật; prompt đường → LeafletMap có tuyến; có ≥1 call geo-API; hiện tool-trace.
**File:** `src/components/render/{ChartBlock,MapBlock,LeafletMap}.tsx`, `src/app/api/chat/route.ts`, system-prompt builder (`src/lib/chat/*`), `src/app/api/{geocode,route,nearby}`.
**Ghi chú:** Đây là tính năng "trưng bày" chính của empty-state → **giá trị cao nhất** nếu làm thật.

---

## CHAT-F3 — OCR chết trên production (thiếu tesseract)  🔴 Cao · effort **S (infra)**
**Triệu chứng:** Đính kèm ảnh → text trả về `[OCR: OCR chưa sẵn sàng: thiếu tesseract]`.
**Bằng chứng:** Hội thoại cũ "IMG_6988.png" hiển thị đúng lỗi này (page-text khi QA).
**Nguyên nhân:** Tesseract chưa cài trên host prod. Đã có quyết định + handoff sẵn nhưng **chưa thực hiện**.
**Đề xuất sửa:** Bake tesseract theo `docker-stack-tesseract` (`apk add tesseract-ocr + data eng/vie/chi_sim` ở runner stage), HOẶC cài native nếu chạy ngoài Docker. ⚠️ route mặc định `vie+eng+chi_sim` → **bắt buộc có `eng`** (Alpine không kèm sẵn).
**Nghiệm thu:** Đính ảnh tiếng Việt → OCR ra text đúng, không còn lỗi "thiếu tesseract".
**File:** `Dockerfile` (runner stage) hoặc host setup; `src/app/api/ocr`.
**Liên quan:** [[docker-stack-tesseract]], [[ocr-tesseract-docker]].

---

## CHAT-F4 — Title hội thoại lẫn nội dung file đính kèm  🟡 TB · effort **S**
**Triệu chứng:** Hội thoại có đính file → tiêu đề = nội dung file thô. Ví dụ thật: `--- Tệp: [C4K]Point2PointSolution.pdf --- %PDF-1.3 %âãÏÓ…` (byte PDF làm title).
**Nguyên nhân:** Tin nhắn gửi đi = `withAttachments(text)` (`ChatClient.tsx:196-203`) prepend block đính kèm **trước** text user; backend `/api/chat` sinh title từ nội dung tin nhắn đầu (gồm cả blob).
**Đề xuất sửa:** Title lấy **text user gõ** (raw `text`), không phải `outgoing`. Cách: gửi kèm `titleHint=text` cho backend ưu tiên; HOẶC backend cắt title từ dòng đầu KHÔNG bắt đầu bằng `--- Tệp:`/`--- URL:`. (Rule 13: đừng để LLM sinh title từ blob.)
**Nghiệm thu:** Conv có đính kèm → title = câu user gõ (vd "Tóm tắt file này"), không phải `%PDF…`.
**File:** `src/components/chat/ChatClient.tsx`, `src/app/api/chat/route.ts` (title-gen).

---

### Chưa kiểm chứng (cần thêm điều kiện môi trường)
- **Abort stream thật**: model quá nhanh (~300 từ/~5s) nên xong trước khi bấm "Dừng" — chỉ xác nhận nút + state đúng. Cần prompt sinh rất dài hoặc throttle để test cancel `AbortController`.
- **Confirm-Card connector (SP-2)** + **tool-trace/citations (SP-4)**: chưa có connector cấu hình / không có tool-call nào nổ → chưa quan sát được. Cần cấu hình 1 connector (vd Trello demo) để test write-gate end-to-end.
