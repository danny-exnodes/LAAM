# Backlog: v1 chưa migrate sang v2

**NGUỒN CHÂN LÝ: `docs/v1-to-v2-migration-handoff.md`** (user/handoff session ghi 2026-06-04). File Serena này chỉ tóm + thêm cross-link cho boot-read (backlog/ nằm trong chuỗi đọc đầu phiên; docs/ thì không).

## 4 phần v1 CHƯA có ở v2 (handoff §1)
1. ~~**Search**~~ — ✅ **ĐÃ PORT (W7, 2026-06-11, branch `feat/r2-postrelease`)**: `src/lib/search.ts` (searchAll ILIKE, escape %_, cap 20/nhóm) + `GET /api/search` + page `/search` + nav. pg_trgm GIN index = nâng cấp sau nếu chậm. Conversations link `/chat` thường (ChatClient chưa có deep-link param).
2. **Office** — `public/office.js` (523 dòng, isometric 2.5D). Nặng; quyết theo mức dùng thật. Ưu tiên thấp.
3. **Proxy log Ollama** (`proxy/server.js`) — **CÓ THỂ BỎ với v2** (v2 gọi thẳng Ollama; chat log Postgres). Chỉ giữ nếu cần giám sát Ollama từ công cụ NGOÀI v2 (handoff §2).
4. ~~**`/api/config`**~~ — ✅ **DONE (R2)**: `GET /api/config` → `{stuckMin}` từ env `LAAM_STUCK_MIN` (default 10, clamp 1..120); `useLiveSessions` + filter Agents dùng chung (hết split-brain). `/api/health` vẫn chưa (nhỏ).

## Thêm (v2-plan §4 — KHÔNG có trong handoff)
- Bảng **`events`** (per-month partition + retention 90 ngày) — chưa tạo; cần cho timeline remote đa máy + full-text search nội dung transcript. **← gap thật còn lại (cùng Office).**
- ~~**Lọc Agents theo máy**~~ ✅ **DONE (R2)**: dropdown lọc theo máy ở FilterBar (`s.machineId` từ /api/events enrich). Lọc theo **owner** vẫn chưa (session chưa expose userId ra LiveSession).

## Residual nhỏ (handoff §4)
cost-by-project/day (Stats thiếu field), relTime i18n (vi-only), Google OAuth thật (đang paste token), fetch-url DNS-rebinding. **PDF export ĐÃ có** (khỏi nhầm là gap).

## ⚠️ Quyết định v1 (handoff §3, mục 5)
**KHÔNG xoá v1 vội** — archive bằng tag/branch **SAU KHI** v2 deploy production + nghiệm thu. v1 vẫn là bản chạy ổn định :4317. Mâu thuẫn với ý "cleanup v1 ngay" → cần user chốt timing. Liên quan: [[poc-model-choice]], [[v2-architecture]].
