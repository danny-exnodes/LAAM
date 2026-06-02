# Qwen local: MCP tool-use & vision — khảo sát (2026-06-02)

Khảo sát thực nghiệm cho trang `/chat` của LAAM (model mặc định **qwen2.5-coder:7b** qua Ollama + proxy).

## A. MCP / tool-use với Qwen 7B

**Phương pháp:** KG mock (`kg_search`, `kg_neighbors`) + vòng lặp tool-use, gọi qua Ollama `/api/chat` với tham số `tools`, 6 prompt. Đo: model có trả **structured `message.tool_calls`** không, và vòng lặp đầy đủ (tool result → câu trả lời cuối) có chạy không.

| Model | structured `tool_calls` | full loop | Ghi chú |
|-------|------------------------|-----------|---------|
| **qwen2.5-coder:7b** (mặc định) | **0/6** ❌ | 0/6 | Nhả tool-call dạng **JSON text** trong `content`, thiếu tag `<tool_call>` → Ollama không parse được. `ollama show` vẫn liệt kê capability `tools`. |
| **qwen2.5:7b** (instruct/general) | **6/6** ✅ | **6/6** ✅ | Trả `message.tool_calls` đúng cấu trúc, vòng lặp KG chạy trọn vẹn. |

**Kết luận:** Với LAAM/Ollama, **MCP tool-use qua API structured không dùng được với bản `coder` 7B** (0/6). Rào cản là **biến thể `coder`** (template không emit tag tool-call), **không phải kích thước** — `coder:14b` cùng template nên không giúp.

**Khuyến nghị (chưa đổi default khi chưa duyệt):** nếu muốn agent/MCP tool-use trên trang chat, chuyển sang **`qwen2.5:7b` (general)** — đã kiểm chứng **6/6**. Bản coder vẫn tốt nhất cho sinh code thuần. Có thể giữ coder làm mặc định chat và chỉ bật `qwen2.5:7b` cho luồng tool-use.

*Workaround nếu buộc dùng coder:* parser JSON tự viết bóc tool-call từ `content` (model emit đúng tên+args ~5/6 với 1 tool, rối khi nhiều tool) — mong manh, không khuyến khích.

## B. Nạp ảnh / vision

Qwen2.5-coder **text-only**, không xem ảnh. Cần **vision model riêng** (dung lượng — nguồn ollama.com/library):

| Model | Tải | RAM chạy |
|-------|-----|----------|
| `moondream` (1.8B) | ~1.7 GB | ~2–3 GB |
| `llava:7b` | 4.7 GB | ~5–6 GB |
| `qwen2.5vl:7b` | 6.0 GB | ~7–8 GB |
| `llava:13b` | 8.0 GB | ~10 GB |

**Ràng buộc trên máy này (16 GB, đang chạy Docker + coder 7B ~5 GB):** nạp **đồng thời** thêm 1 vision 7B (~6–8 GB) ⇒ tổng model ~11–13 GB + Docker + hệ thống → **vượt RAM, swap nặng** (đã thấy với 14B). **Không khả thi chạy 2 model 7B song song.**

**Phương án:**
1. **Model-swap**: unload coder, load vision theo request có ảnh (+~8–10s/lần load, áp lực RAM cao). Cần một model-router.
2. **moondream (~1.7 GB)**: đủ nhỏ để cùng tồn tại, nhưng chất lượng yếu.

→ Vision **làm được nhưng cần model-router + đánh đổi**, **ngoài phạm vi hard-lock 7B hiện tại**. Trang chat hiện làm **khung upload file** (text/pdf) chứ chưa bật vision; muốn bật ảnh thì cần thêm vision model + router (đề xuất `qwen2.5vl:7b` với model-swap, hoặc `moondream` nếu ưu tiên RAM).
