# Checkpoint: w4-workflow-ux (implement agent) — 2026-06-11

## What was done
- W4 gap 1 — Cancel run: PATCH /api/workflows/runs/[id] {action:'cancel'} (owner-only 404, queued|running only, 409 nếu terminal, race-guard re-check, SSE publish). Engine: EngineDeps.shouldStop (additive DI) — re-read status run từ DB TRƯỚC mỗi node (cả foreach body); cancelled → dừng gọn, không failed, step đã xong giữ nguyên. run.ts: flip queued→running CÓ ĐIỀU KIỆN (không lật ngược run đã cancelled), shouldStop fail-soft. resume.ts: cùng cơ chế (run resume là 'running' nên PATCH cancel phải hiệu lực) + flip có điều kiện. tickResume không nhặt run cancelled (claim chỉ 'resumable' — test khoá điều kiện claim).
- W4 gap 2 — Connector/action picker: ĐÃ CÓ SẴN trong base (NodeConfigPanel select + /api/connectors trả tools[] {name,description,parameters}); verify test xanh, KHÔNG sửa gì.
- W4 gap 3 — Toast run-finish: WorkflowDetailClient — live SSE status → terminal (succeeded/failed/cancelled) → toast mini inline (role="status"), tự ẩn 5s. + nút "Huỷ run" trên row queued|running.
- i18n workflows dict: wf.run.cancel, wf.run.cancelFailed, wf.toast.{succeeded,failed,cancelled} ×3 (vi/en/zh).

## Files changed
- src/lib/workflow/engine.ts, run.ts, resume.ts
- src/app/api/workflows/runs/[id]/route.ts (+ route.test.ts MỚI, 8 tests)
- src/components/workflows/WorkflowDetailClient.tsx (+ test +7)
- src/i18n/dictionaries/workflows.ts
- src/lib/workflow/engine.test.ts (+3), run.test.ts (+3), tick-resume.test.ts (+1)

## Current state
- Targeted tests xanh: workflow area 44 files / 464 tests pass; tsc --noEmit sạch. Chưa chạy full suite (theo ràng buộc). Chưa commit (theo ràng buộc).

## Next steps
- Orchestrator: review + chạy full suite + commit trên branch feat/r2-postrelease.

## Blockers / Risks
- Foreach bị cancel giữa body: row step của foreach giữ status 'running' trong DB (không có step-status 'cancelled'); run-level 'cancelled' là nguồn sự thật — UI step hiển thị spinner nếu mở chi tiết run đã huỷ giữa foreach.
- Cancel race với finalize: nếu run finalize đúng lúc PATCH — guard re-check trả 409; nếu PATCH thắng sau shouldStop check cuối, finalize có thể ghi đè cancelled→succeeded (run thực sự đã chạy xong — chấp nhận).
