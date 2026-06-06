# Backlog: World-Tools Layer — followups

Từ implement world-tools (2026-06-06, branch `worktree-world-tools`). Core đã xong + verify (897 test); đây là phần **cố ý hoãn** (Rule 12 — nêu rõ, không skip im). Xem [[world-tools-layer]].

## Cần host/Ollama
- **Eval scenarios cho web tool** (stretch W5 CHƯA làm): thêm `web_search`/`web_read` vào `scripts/eval/union-tools.ts` + stub output `scripts/eval/stub-dispatch.ts` + 1 scenario grounding `scripts/eval/scenarios/` (Rule 13: mock SearXNG trả URL khác → bắt model bịa link) + đăng ký `scenarios/index.ts`. Không tự làm vì `npm run eval` cần Ollama. ~30′ khi có Ollama.
- **Runtime E2E**: `docker compose up -d searxng` (sửa `secret_key` trước), set `SEARXNG_URL` → chat thử "tìm X trên web" xác nhận model gọi web_search→web_read + trích nguồn.

## Cải tiến (tuỳ chọn)
- **URL-level citations**: enhance `deriveCitations` (`src/lib/chat/trace.ts`) đọc `url` trong result → "Nguồn: <url>" thay vì tên tool (hiện cite-by-name đã chạy).
- **DDG fallback**: SearXNG down → fallback DuckDuckGo HTML trong `src/lib/web/searxng.ts`.
- **Full-text transcript grep**: `laam_search_sessions` chỉ search summary DB; grep `.jsonl` (host-only) = phần còn lại của Search v1 chưa port.
- **Promote OCR + geo**: `/api/ocr` (Tesseract) + `/api/geocode|route|nearby` → tool model gọi được (giống web_read promote).
- **fs_/sys_ tools**: đọc file / chạy lệnh sandbox (`kind:write` qua SP-2 gate) — cần thiết kế gate path-traversal/RCE riêng.
