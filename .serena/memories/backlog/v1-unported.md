# Backlog: v1 chưa migrate sang v2

**NGUỒN CHÂN LÝ: `docs/v1-to-v2-migration-handoff.md`** (user/handoff session ghi 2026-06-04). File Serena này chỉ tóm + thêm cross-link cho boot-read (backlog/ nằm trong chuỗi đọc đầu phiên; docs/ thì không).

## 4 phần v1 CHƯA có ở v2 (handoff §1)
1. **Search** — `public/search.*` + `/api/search` + `lib/search.js`. Port rẻ: 1 lib + 1 endpoint + 1 page; nên dùng **tsvector/pg_trgm** (v2 có Postgres). **Khuyến nghị migrate.**
2. **Office** — `public/office.js` (523 dòng, isometric 2.5D). Nặng; quyết theo mức dùng thật. Ưu tiên thấp.
3. **Proxy log Ollama** (`proxy/server.js`) — **CÓ THỂ BỎ với v2** (v2 gọi thẳng Ollama; chat log Postgres). Chỉ giữ nếu cần giám sát Ollama từ công cụ NGOÀI v2 (handoff §2).
4. **`/api/config` + `/api/health`** — nhỏ; v2 hardcode stuck=10' → đưa vào config (`LAAM_STUCK_MIN`).

## Thêm (v2-plan §4 — KHÔNG có trong handoff)
- Bảng **`events`** (per-month partition + retention 90 ngày) — chưa tạo; cần cho timeline remote đa máy + full-text search nội dung transcript.
- **Lọc Agents theo máy/owner** — P3 đã ingest đa máy nhưng UI chưa filter.

## Residual nhỏ (handoff §4)
cost-by-project/day (Stats thiếu field), relTime i18n (vi-only), Google OAuth thật (đang paste token), fetch-url DNS-rebinding. **PDF export ĐÃ có** (khỏi nhầm là gap).

## ⚠️ Quyết định v1 (handoff §3, mục 5)
**KHÔNG xoá v1 vội** — archive bằng tag/branch **SAU KHI** v2 deploy production + nghiệm thu. v1 vẫn là bản chạy ổn định :4317. Mâu thuẫn với ý "cleanup v1 ngay" → cần user chốt timing. Liên quan: [[poc-model-choice]], [[v2-architecture]].
