# Checkpoint: w1-perf-monitoring — 2026-06-11

## What was done
- **M1 scan cache:** `parser.js scanAll()` + `localParser.js scanLocal()` giờ có cache per-file module-level (`Map path → {mtimeMs, size, parsed}`). File không đổi (mtime+size khớp) → không `readFileSync`, chỉ recompute field phụ thuộc `now` (`status` + `durationMs` của sub-agent đang chạy — nếu cache nguyên trạng thì agent xong việc sẽ "running" mãi). File đổi → re-parse; file biến mất → prune. Stat TRƯỚC khi đọc (append giữa stat–read ⇒ lần sau re-parse, không bao giờ serve stale).
- **M2 SSE shared snapshot:** `/api/events` chuyển sang registry client module-level + 1 bus subscription (subscribe khi client đầu vào, release khi client cuối ra). 1 bus event = 1 query snapshot + 1 stringify, broadcast cho mọi client. Initial snapshot per-client, keepalive 25s per-client, cleanup giữ nguyên. Wire format KHÔNG đổi (`event: sessions` / `workflow_run*`).

## Files changed
- `src/lib/monitoring/parser.js` (+cache, `clearScanCache`, `scanCacheSize`)
- `src/lib/monitoring/localParser.js` (+cache, `clearLocalScanCache`)
- `src/lib/monitoring/parser.test.ts` (+4 test cache)
- `src/lib/monitoring/localParser.test.ts` (MỚI, 3 test)
- `src/app/api/events/route.ts` (registry + broadcast, +`clientCount`)
- `src/app/api/events/route.test.ts` (+4 test GET stream)

## Current state
- 19/19 test (3 file trên) xanh; 25/25 test consumer (sync/ingest/monitoring/read-model/stats) xanh. `tsc --noEmit`: file của W1 sạch; 6 lỗi còn lại đều ở `src/app/api/config/route.test.ts` (agent khác, không đụng).

## Next steps
- Không có cho W1. Collector (W2) cũng hưởng cache khi chạy interval.

## Blockers / Risks
- `clientCount` export thêm từ route file — theo tiền lệ `mapRowToLiveSession` đã export sẵn (build main vẫn pass).
- Cache giữ parsed session trong RAM (~vài KB/file); prune theo lần scan gần nhất.
