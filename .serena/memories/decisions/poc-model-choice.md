# Quyết định: Model POC — 1 model duy nhất `qwen3-vl:8b-instruct-q8_0`

Ngày: 2026-06-04. Bối cảnh: chốt model cho POC chạy trên máy host (RTX 5070 Ti **16 GB** VRAM / Ultra 9 285K / 128 GB). POC cần đủ: **chat (vi) + OCR + connector + tool-call**.

## Quyết định (đã khoá)
- **1 model duy nhất** cho cả chat lẫn tool-call: **`qwen3-vl:8b-instruct-q8_0`** (Q8, 9.8 GB, bản *instruct*).
- **KHÔNG smart-routing Gemma↔Qwen** ở POC — và lưu ý routing **vốn chưa từng được implement** (code `/api/chat` chỉ dùng `payload.model` cho cả tool-loop; grep `smart/routeModel/qwen` trong source = rỗng).
- **OCR vẫn do Tesseract** (vie+eng+chi_sim), độc lập model. **Vision của model CHƯA nối dây**: `ChatClient.onAddFiles` → `/api/ocr` → text → `withAttachments` ghép vào message; `buildOllamaPayload` chỉ gửi text. Muốn model "nhìn" ảnh thật = enhancement sau (đẩy `images` vào payload Ollama).
- **Cấu hình ĐỦ:** `DEFAULT_CHAT_MODEL=qwen3-vl:8b-instruct-q8_0` trong `v2/.env`. `/api/chat/info` trả về giá trị này, `ChatClient` preselect (ghi đè hardcode `gemma4:e4b` ở `types.ts`). Không cần sửa source.

## Lý do
- Lý do smart-routing (Gemma rớt tool-call ~2/3 — xem [[v2-architecture]]) **biến mất** nếu lấy thẳng tool-caller giỏi làm model duy nhất. Qwen3-VL đủ mạnh chat + đa phương thức + tool.
- Ollama: `qwen3-vl` badge **vision · tools · thinking**; size `8b` fit 16 GB (q4_K_M 6.1 / **q8_0 9.8** / bf16 18 → tràn). `30b/32b` = 20–21 GB → tràn VRAM, loại. Không có nấc 14B ở giữa.
- Gemma 4 12B trên Ollama hiện chủ yếu là `12b-mlx` (Apple Silicon) → rủi ro cho NVIDIA/Windows → để dành làm nâng cấp chất lượng chat sau.
- **Q8 thay vì Q4:** tăng độ trung thực JSON tool-call (rủi ro số 1 của POC), vẫn chạy trọn GPU, còn ~6 GB đệm. Hạ về `qwen3-vl:8b` (Q4, 6.1 GB) chỉ là đổi 1 dòng nếu cần thêm đệm cho vision/parallel.

## Hệ quả / liên quan
- **Lệch khỏi [[v2-architecture]]** (vốn khoá `gemma4:e4b` default + smart-routing). Chỉ áp dụng cho **POC**; revisit khi scale >1 GPU hoặc cần chất lượng chat cao hơn. Service: [[v2-app]]. Host: xem checkpoint + memory host-target.
- Setup tự động: `v2/setup-poc.ps1`.
- Nghiệm thu quan trọng nhất: `/chat` "liệt kê repo của tôi" sau khi connect GitHub → tool-call chạy thật. Pass = chốt single-model.
