# Checkpoint: w2-ingest-collector — 2026-06-11

## What was done
- M7: /api/ingest size guard — content-length > 5MB → 413 TRƯỚC khi parse body
  (sau auth, để không đổi semantics 401). Thiếu content-length → parse như cũ.
- M9: collector retry — pushOnce fail → retry 1 lần sau backoff 2s (RETRY_BACKOFF_MS);
  fail kép → log timestamp + consecutiveFailures, không crash setInterval; thành công → reset.
- Tách `pushWithRetry` + `makeCycle` export được; thêm guard isMain (pathToFileURL)
  để test import .mjs không kích hoạt CLI/process.exit.
- Xác nhận upsertSessions (src/lib/sync.ts) không đổi contract — chỉ thêm error path 413 additive.

## Files changed
- src/app/api/ingest/route.ts (size guard + MAX_BODY_BYTES)
- src/app/api/ingest/route.test.ts (+4 test size guard)
- collector/laam-collector.mjs (retry/backoff/counter + isMain guard, vẫn zero-dep)
- collector/laam-collector.test.mjs (mới, 7 test)

## Current state
- `npx vitest run src/app/api/ingest/route.test.ts collector/laam-collector.test.mjs`
  → 2 files / 15 tests passed.
- CLI verify: chạy trực tiếp không token → in lỗi + exit 1 (hành vi cũ giữ nguyên).
- Chưa commit (theo ràng buộc orchestrator).

## Next steps
- Orchestrator gom các task W* trên branch feat/r2-postrelease rồi review/commit.

## Blockers / Risks
- Request không có content-length (chunked) vẫn parse — đã ghi chú; backstop là req.json().catch.
- consecutiveFailures đếm theo chu kỳ (1 chu kỳ = tối đa 2 lần thử), không theo từng attempt.
