# Checkpoint: implement-w6 — 2026-06-11

## What was done
- W6: GET /api/config (session-protected) trả `{stuckMin}` từ env `LAAM_STUCK_MIN` (default 10, clamp 1..120).
- useLiveSessions: bỏ hardcode 10' → fetch /api/config 1 lần khi mount, fallback 10; stuck/notify chuyển sang effect [sessions, stuckMin] (config về muộn vẫn re-evaluate). Contract hook KHÔNG đổi.
- Lọc Agents theo MÁY: enrich /api/events snapshot + mapRowToLiveSession với `machineId` (additive); `LiveSession.machineId?` optional; AgentFilters + applyFilters thêm `machine`; FilterBar thêm dropdown máy (option từ GET /api/machines, label = name ?? hostname ?? id); AgentsClient fetch machines 1 lần.
- Lọc OWNER: KHÔNG làm — `agent_sessions.userId` có trong schema nhưng KHÔNG code path nào ghi (sync.ts/upsertSessions không set, ingest không truyền) → luôn NULL, không hiển thị được.
- i18n: thêm `agents.machineAll` (vi/en/zh) vào dict agents.

## Files changed
- NEW: src/app/api/config/route.ts + route.test.ts
- src/hooks/useLiveSessions.ts + .test.tsx
- src/app/api/events/route.ts + route.test.ts (merge sạch với refactor perf M2 của agent khác)
- src/components/agents/{filters.ts,filters.test.ts,FilterBar.tsx,FilterBar.test.tsx,AgentsClient.tsx,AgentsClient.test.tsx}
- src/i18n/dictionaries/agents.ts

## Current state
- Targeted vitest: 57/57 xanh (10 file: config, events, hook, agents components).
- tsc --noEmit: file của W6 sạch; lỗi còn lại ở ChatClient.tsx + ActivityTimeline.tsx = work-in-flight của agent khác.

## Next steps
- Agent Docs: thêm `LAAM_STUCK_MIN` vào .env.example + README.
- Residual: filters.ts status="stuck" vẫn hardcode 10' (khác badge nếu LAAM_STUCK_MIN≠10) — cần quyết thread config xuống applyFilters hay chấp nhận.

## Blockers / Risks
- Worktree dùng chung nhiều agent — events route bị refactor song song giữa phiên (đã merge tay, test xanh).
