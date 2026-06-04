# Quyết định: Host environment + Ollama ops (POC trên máy này)

Ngày: 2026-06-04. Tóm các thảo luận về môi trường host + vận hành Ollama. Model: [[poc-model-choice]].

## Máy host (đã chốt = máy này)
- **CPU** Intel Core Ultra 9 285K (24 nhân/24 luồng) · **RAM** 128 GB · **GPU** NVIDIA RTX 5070 Ti **16 GB** VRAM (Blackwell, compute 12.0, driver 591.86 — *WMI báo nhầm 4 GB, tin `nvidia-smi`*) · Đĩa C: ~116 GB trống.
- Đã có sẵn: Node 24.11, npm 11.6, Docker 28.5 + Compose, git, winget 1.28. **Thiếu (chỉ cho tier AI):** Ollama, Tesseract.

## Mô hình host — 2 tầng (degrade nhẹ nhàng)
- **Tier 1 lõi (BẮT BUỘC):** Node ≥20 + **PostgreSQL 16 (Docker)**. Đủ cho giám sát/dashboard/agents/connectors-mgmt. KHÔNG cần GPU/AI.
- **Tier 2 AI (TUỲ CHỌN):** Ollama (+model) cho `/chat`/tool-call; Tesseract (vie+eng+chi_sim) cho OCR. Thiếu → `/api/chat` trả 502, `/api/ocr` trả 503; phần còn lại CHẠY BÌNH THƯỜNG (`route.ts:198`, `ocr/route.ts:59`).
- **Cổng:** 3000 (app) · 5432 (Postgres) · 8080 (Adminer) · 11434 (Ollama).
- **Env (`.env` root):** `DATABASE_URL`, `AUTH_SECRET` (bắt buộc), `OLLAMA_URL`, `DEFAULT_CHAT_MODEL=qwen3-vl:8b-instruct-q8_0`, `CONNECTOR_KEY` (prod). Sinh secret trên Windows: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
- Production: `npm run build && npm run start`; process manager (NSSM/pm2) + Docker autostart. Truy cập <50 user nội bộ: Tailscale Serve (Phase 6 chưa code).

## Ollama ops trên 16 GB VRAM (đa model / đồng thời)
- Ollama nạp **từng model riêng** (không share trọng số). Giữ nhiều model cùng nạp **chỉ khi vừa trọn VRAM**; không đủ → request **xếp hàng** + đẩy model nhàn rỗi (LRU), hoặc tràn layer xuống CPU/RAM (chậm). 128 GB RAM = lưới an toàn, không phải tăng tốc.
- Knobs: `OLLAMA_MAX_LOADED_MODELS` (def 3×GPU) · `OLLAMA_NUM_PARALLEL` (def auto 1/4) · `OLLAMA_KEEP_ALIVE` (def 5'). **Khuyến nghị POC:** `OLLAMA_KEEP_ALIVE=-1` ghim model thường trú; 1 model dùng chung → batch qua NUM_PARALLEL.
- **Fit 16 GB (Q4):** qwen3-vl `8b` q4 6.1 / **q8 9.8 (đã chọn)** / bf16 18 (tràn). `30b/32b` = 20–21 GB → **tràn, loại** (không có nấc 14B giữa). Lên model to hơn = offload CPU, chậm → để sau / GPU ≥24 GB.

## Gemma 4 (tham khảo — vì sao KHÔNG chọn cho POC)
- Ra 2026-04-02. Min RAM Q4: E2B 2.9 / E4B 4.5 / 12B 6.7 / 26B-A4B 14.4 / 31B 17.5. Trên Ollama bản `12b` chủ yếu là `12b-mlx` (Apple Silicon) → **rủi ro cho NVIDIA/Windows** → để dành nâng cấp chất lượng chat sau. Chọn qwen3-vl vì badge vision+tools+thinking rõ ràng + đã là tool-caller tin cậy của dự án.

## Setup
`setup-poc.ps1` (root) — Ollama+model+Tesseract+Postgres+.env+migrate+build. Chạy Admin (winget/PATH/Program Files). Nghiệm thu 4 nhiệm vụ: chat vi / OCR ảnh Việt / connect GitHub / "liệt kê repo" → tool-call.
