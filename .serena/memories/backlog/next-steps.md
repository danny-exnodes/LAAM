# Backlog: Next steps (handoff cho phiên sau)

Cập nhật: 2026-06-04. Trạng thái: restructure **đã MERGE vào main** (`97968a4`); LAAM **đang chạy** trên máy host. Boot phiên sau: đọc [[poc-model-choice]] + [[poc-host-and-ollama-ops]] + checkpoint `claude-2026-06-04.md`.

## Đang chạy (xác nhận 2026-06-04)
- Postgres (Docker `laam-v2-postgres`/`-adminer`) + **11 bảng** migrated. App `npm run start` **:3000** (+Tailscale `100.104.39.38:3000`). Ollama v0.30.4 + `qwen3-vl:8b-instruct-q8_0` **100% GPU**. `.env` ở root (gitignored).
- ⚠️ App + smoke-test chạy qua **tiến trình nền của phiên trước** → **có thể đã tắt** khi mở phiên mới. Khởi động lại: `docker compose up -d` (nếu Postgres tắt) + `npm run start`. Ollama tự chạy (service Windows).

## P0 — Việc của USER (đang chờ)
1. **Đăng ký owner**: `:3000` → Đăng ký → tài khoản **ĐẦU TIÊN = owner**. (Cố ý chưa làm để user là owner. Reset DB → phải đăng ký lại — gốc rễ "chat/connectors trông như hỏng".)
2. **Cài Tesseract** (OCR) — PowerShell **Admin**: `.\setup-poc.ps1` (idempotent) HOẶC `winget install UB-Mannheim.TesseractOCR` + traineddata vie/chi_sim vào `C:\Program Files\Tesseract-OCR\tessdata` + thêm PATH. (winget bị UAC chặn khi chạy non-interactive → phải Admin tay.)

## P0 — Nghiệm thu POC (4 nhiệm vụ; PASS = chốt single-model)
1. **Chat (vi):** `/chat` hỏi tiếng Việt → stream OK (model sẵn sàng, đã test "Hà Nội").
2. **OCR:** đính kèm ảnh chữ Việt → Tesseract → model tóm tắt *(cần Tesseract)*.
3. **Connector:** `/connectors` → connect GitHub bằng **PAT của user**.
4. **Tool-call:** `/chat` "liệt kê repo của tôi" → model gọi `github_list_repos` → kết quả thật. ⟵ phép thử quan trọng nhất.

## P1 — Độ bền (production trên máy này)
- Windows Service (NSSM/pm2) cho `npm run start`; Docker Desktop "start at login"; Ollama service (đã tự chạy).
- `OLLAMA_KEEP_ALIVE=-1` đã `setx` → **restart Ollama** để áp dụng (ghim model thường trú, tránh cold-start mỗi lần chat sau 5').

## P2 — v1 chưa migrate → port dần (xem [[v1-unported]])
- Thứ tự đề xuất: **Search** (rẻ, ROI cao) → `/api/config` (bỏ hardcode stuck 10') → **Office** (nặng) → quyết fate `proxy/` (bỏ được; archive ở `archive/v1`).
- **Vision enhancement:** đẩy `images` vào payload Ollama (sửa `buildOllamaPayload` + `ChatClient.withAttachments`) → dùng vision thật của qwen3-vl (badge vision), có thể thay Tesseract.

## P3 — Deploy nội bộ (Phase 6, chưa code)
- Tailscale Serve + hardening + audit log; thử tải <50 user. Xem `docs/v2-plan.md` §6/§8.

## Quy ước (giữ như restructure)
- Việc lớn/đụng nhiều file → **branch + PR** + verify `npm run build` & `npm test` (baseline 375) trước merge. Setup script: `setup-poc.ps1` (root). v1 đầy đủ ở branch `archive/v1` (chạy :4317 được).
