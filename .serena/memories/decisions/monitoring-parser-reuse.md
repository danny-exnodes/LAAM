# Decision: v2 tái dùng parser v0.9 (không viết lại)

Ngày: 2026-06-03.

- `lib/parser.js`, `lib/pricing.js`, `lib/localParser.js` (vanilla, self-contained, chỉ node builtins) được **copy vào `v2/src/lib/monitoring/`** và import từ code server (allowJs). Tránh viết lại parser đã kiểm chứng. Khi parser gốc đổi → đồng bộ bản copy.
- **`upsertSessions()`** trong `v2/src/lib/sync.ts` là code dùng chung cho **local sync** (host, qua `syncLocalMonitoring`) và **`/api/ingest`** (collector từ xa). Mọi nơi ghi agent_sessions nên đi qua hàm này.
- **Collector** `v2/collector/laam-collector.mjs` (zero-dep) cũng import chính parser đó → parse tại máy dev rồi POST `/api/ingest` (Bearer machine-token).
- **Caveat:** `agent_sessions.transcriptPath` (để Session-detail đọc timeline live) chỉ hợp lệ cho **máy host**; session đẩy từ collector (máy khác) có `file=null` → timeline không live-read được (sẽ cần push events ở phase sau; bảng `events` chưa làm).
