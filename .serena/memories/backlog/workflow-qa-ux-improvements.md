# Workflow QA — UX improvements (E2E 2026-06-05)

- **Phản hồi run chủ động** (gắn F4): toast khi bắt đầu / xong / lỗi run, kèm lý do. Hiện phải tự phát hiện dòng "Thất bại" + đào 3 lớp click mới thấy nguyên nhân.
- ✅ **DONE 2026-06-23** — Render markdown cho output agent step: `WorkflowDetailClient` StepRow nay dùng `MarkdownView` cho output chuỗi (agent digest), giữ `<pre>` cho JSON. (Output prose font item bên dưới cũng được giải quyết theo.)
- **Nhãn step thân thiện**: step hiện nodeId thô ("fetch", "summarize") → nên hiện action/label (vd "demo.demo_list_tasks") hoặc tên do user đặt.
- **Detail page tải chậm** (~5s spinner toàn trang, 3 fetch client tuần tự). Cân nhắc SSR hoặc skeleton; ít nhất giữ header/khung khi tải (hiện trắng + spinner giữa).
- **Thông điệp validate kỹ thuật/khó hiểu** ("validate: cần đúng 1 start, có 2") — không chỉ rõ node lỗi, không i18n. Nên: nêu node + ngôn ngữ người dùng.
- **Tiến trình run dài**: nút chỉ spinner; không cho biết step nào đang chạy (SSE `useWorkflowEvents` có, nhưng manual-run path re-fetch sau khi xong nên không thấy live). Hiện step running realtime.
- **needs-attention**: run failed chỉ có tam giác đỏ trên dòng; nên đẩy/lọc workflow cần chú ý lên đầu list (hoặc 1 khu vực riêng).
- **Output prose ở font monospace** (`<pre>`) trông như code — với văn xuôi tự nhiên thì nên font thường.
- **Ngữ nghĩa status "active"**: workflow từ template chưa từng chạy + không lịch vẫn "Đang hoạt động" — hơi lạ; clone reset "Nháp" nhưng vẫn chạy được (status chỉ là nhãn).
- **Reliability (AGENTS.md Rule 13)**: moat digest chứa ID phiên + số liệu (82 agent hoàn thành, 717k/1.2M token) do **LLM 8B tái tạo** → có thể sai/ảo. Digest tư vấn (người đọc) nên rủi ro thấp, nhưng giá trị moat phụ thuộc độ chính xác model. (Handoff §8 đã cảnh báo content bất định.) Cân nhắc: code chèn số liệu ground-truth thay vì để model tự "nhớ".
